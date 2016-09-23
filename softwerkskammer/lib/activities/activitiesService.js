'use strict';

const async = require('async');
const R = require('ramda');

const beans = require('simple-configure').get('beans');

const activitystore = beans.get('activitystore');
const groupsService = beans.get('groupsService');
const groupstore = beans.get('groupstore');
const membersService = beans.get('membersService');
const memberstore = beans.get('memberstore');
const notifications = beans.get('notifications');
const fieldHelpers = beans.get('fieldHelpers');
const CONFLICTING_VERSIONS = beans.get('constants').CONFLICTING_VERSIONS;

module.exports = {
  getActivitiesForDisplay: function getActivitiesForDisplay(activitiesFetcher, callback) {
    async.parallel(
      {
        activities: activitiesFetcher,
        groups: groupsService.getAllAvailableGroups,
        groupColors: groupsService.allGroupColors.bind(groupsService)
      },

      (err, results) => {
        if (err) { callback(err); }
        results.activities.forEach(activity => {
          activity.colorRGB = activity.colorFrom(results.groupColors);
          activity.groupFrom(results.groups); // sets the group object in activity
        });
        callback(null, results.activities);
      }
    );
  },

  getUpcomingActivitiesOfMemberAndHisGroups: function getUpcomingActivitiesOfMemberAndHisGroups(member, callback) {
    const groupIds = member.subscribedGroups.map(group => group.id);
    const activitiesFetcher = R.partial(activitystore.activitiesForGroupIdsAndRegisteredMemberId, [groupIds, member.id(), true]);

    return this.getActivitiesForDisplay(activitiesFetcher, callback);
  },

  getPastActivitiesOfMember: function getPastActivitiesOfMember(member, callback) {
    const activitiesFetcher = R.partial(activitystore.activitiesForGroupIdsAndRegisteredMemberId, [[], member.id(), false]);

    return this.getActivitiesForDisplay(activitiesFetcher, callback);
  },

  getActivityWithGroupAndParticipants: function getActivityWithGroupAndParticipants(url, callback) {
    activitystore.getActivity(url, (err, activity) => {
      if (err || !activity) { return callback(err); }

      function participantsLoader(cb) {
        memberstore.getMembersForIds(activity.allRegisteredMembers(), (err1, members) => {
          async.each(members, membersService.putAvatarIntoMemberAndSave, () => cb(err1, members));
        });
      }

      async.parallel(
        {
          group: cb => groupstore.getGroup(activity.assignedGroup(), cb),
          participants: participantsLoader,
          owner: cb => memberstore.getMemberForId(activity.owner(), cb)
        },

        (err1, results) => {
          if (err1) {return callback(err1); }
          activity.group = results.group;
          activity.participants = results.participants;
          activity.ownerNickname = results.owner ? results.owner.nickname() : undefined;
          callback(null, activity);
        }
      );
    });
  },

  isValidUrl: function isValidUrl(reservedURLs, url, callback) {
    const isReserved = new RegExp(reservedURLs, 'i').test(url);
    if (fieldHelpers.containsSlash(url) || isReserved) { return callback(null, false); }
    activitystore.getActivity(url, (err, result) => {
      if (err) { return callback(err); }
      callback(null, result === null);
    });
  },

  activitiesBetween: function activitiesBetween(startMoment, endMoment, callback) {
    activitystore.allActivitiesByDateRangeInAscendingOrder(startMoment.unix(), endMoment.unix(), callback);
  },

  addVisitorTo: function addVisitorTo(memberId, activityUrl, resourceName, moment, callback) {
    const self = this;
    activitystore.getActivity(activityUrl, (err, activity) => {
      if (err || !activity) { return callback(err, 'message.title.problem', 'message.content.activities.does_not_exist'); }
      if (activity.resourceNamed(resourceName).addMemberId(memberId, moment)) {
        return activitystore.saveActivity(activity, err1 => {
          if (err1 && err1.message === CONFLICTING_VERSIONS) {
            // we try again because of a racing condition during save:
            return self.addVisitorTo(memberId, activityUrl, resourceName, moment, callback);
          }
          if (err1) { return callback(err1); }
          notifications.visitorRegistration(activity, memberId, resourceName);
          return callback(err1);
        });
      }
      return callback(null, 'activities.registration_not_now', 'activities.registration_not_possible');
    });
  },

  removeVisitorFrom: function removeVisitorFrom(memberId, activityUrl, resourceName, callback) {
    const self = this;
    activitystore.getActivity(activityUrl, (err, activity) => {
      if (err || !activity) { return callback(err, 'message.title.problem', 'message.content.activities.does_not_exist'); }
      activity.resourceNamed(resourceName).removeMemberId(memberId);
      activitystore.saveActivity(activity, err1 => {
        if (err1 && err1.message === CONFLICTING_VERSIONS) {
          // we try again because of a racing condition during save:
          return self.removeVisitorFrom(memberId, activityUrl, resourceName, callback);
        }
        notifications.visitorUnregistration(activity, memberId, resourceName);
        return callback(err1);
      });
    });
  },

  addToWaitinglist: function addToWaitinglist(memberId, activityUrl, resourceName, moment, callback) {
    activitystore.getActivity(activityUrl, (err, activity) => {
      if (err || !activity) { return callback(err, 'message.title.problem', 'message.content.activities.does_not_exist'); }
      const resource = activity.resourceNamed(resourceName);
      if (resource.hasWaitinglist()) {
        resource.addToWaitinglist(memberId, moment);
        return activitystore.saveActivity(activity, err1 => {
          if (err1 && err1.message === CONFLICTING_VERSIONS) {
            // we try again because of a racing condition during save:
            return this.addToWaitinglist(memberId, activityUrl, resourceName, moment, callback);
          }
          notifications.waitinglistAddition(activity, memberId, resourceName);
          return callback(err1);
        });
      }
      return callback(null, 'activities.waitinglist_not_possible', 'activities.no_waitinglist');
    });
  },

  removeFromWaitinglist: function removeFromWaitinglist(memberId, activityUrl, resourceName, callback) {
    const self = this;
    activitystore.getActivity(activityUrl, (err, activity) => {
      if (err || !activity) { return callback(err, 'message.title.problem', 'message.content.activities.does_not_exist'); }
      activity.resourceNamed(resourceName).removeFromWaitinglist(memberId);
      return activitystore.saveActivity(activity, err1 => {
        if (err1 && err1.message === CONFLICTING_VERSIONS) {
          // we try again because of a racing condition during save:
          return self.removeFromWaitinglist(memberId, activityUrl, resourceName, callback);
        }
        notifications.waitinglistRemoval(activity, memberId, resourceName);
        return callback(err1);
      });
    });
  }
};
