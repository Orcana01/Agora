/*eslint no-underscore-dangle: 0*/
'use strict';

const R = require('ramda');

const beans = require('simple-configure').get('beans');
const e = beans.get('eventConstants');
const roomOptions = beans.get('roomOptions');

function projectRoomPairs(roomType, roomPairs, event) {
  if (event.event === e.ROOM_PAIR_WAS_ADDED && event.roomType === roomType) {
    return R.append({participant1Id: event.participant1Id, participant2Id: event.participant2Id}, roomPairs);
  }
  if ((event.event === e.ROOM_PAIR_WAS_REMOVED || event.event === e.ROOM_PAIR_CONTAINING_A_PARTICIPANT_WAS_REMOVED) && event.roomType === roomType) {
    return R.reject(function (pair) {
      return pair.participant1Id === event.participant1Id && pair.participant2Id === event.participant2Id;
    }, roomPairs);
  }

  return roomPairs;
}

function projectParticpantsInRoom(roomType, participants, event) {
  if (event.event === e.ROOM_PAIR_WAS_ADDED && event.roomType === roomType) {
    return R.append(event.participant2Id, R.append(event.participant1Id, participants));
  }
  if ((event.event === e.ROOM_PAIR_WAS_REMOVED || event.event === e.ROOM_PAIR_CONTAINING_A_PARTICIPANT_WAS_REMOVED) && event.roomType === roomType) {
    return R.reject(function (participant) {
      return participant === event.participant1Id || participant === event.participant2Id;
    }, participants);
  }

  return participants;
}


class RoomsReadModel {
  constructor(eventStore, registrationReadModel) {
    this._registrationReadModel = registrationReadModel;

    // read model state:
    this._roomPairsFor = {};
    this._participantsIn = {};
    roomOptions.allIds().forEach(roomType => {
      this._roomPairsFor[roomType] = [];
      this._participantsIn[roomType] = [];
    });

    this.update(eventStore.events());
  }

  update(events) {
    roomOptions.allIds().forEach(roomType => {
      this._roomPairsFor[roomType] = R.reduce(R.partial(projectRoomPairs, [roomType]), this._roomPairsFor[roomType], events);
      this._participantsIn[roomType] = R.reduce(R.partial(projectParticpantsInRoom, [roomType]), this._participantsIn[roomType], events);
    });
  }

  roomPairsFor(roomType) {
    return this._roomPairsFor[roomType];
  }

  isRoomPairIn(roomType, participant1Id, participant2Id) {
    return R.find(function (pair) {
      return pair.participant1Id === participant1Id || pair.participant2Id === participant2Id;
    }, this.roomPairsFor(roomType));
  }

  participantsInRoom(roomType) {
    return this._participantsIn[roomType];
  }

  participantsWithoutRoomIn(roomType) {
    return R.difference(this._registrationReadModel.allParticipantsIn(roomType), this.participantsInRoom(roomType));
  }

  roommateFor(roomType, memberId) {
    const pairWithMember = R.find(function (pair) {
      return pair.participant1Id === memberId || pair.participant2Id === memberId;
    }, this.roomPairsFor(roomType));

    if (pairWithMember) {
      return pairWithMember.participant1Id === memberId ? pairWithMember.participant2Id : pairWithMember.participant1Id;
    }
    return undefined;
  }

  roomPairsWithFullMembersFrom(roomType, memberList) {
    return R.map(function (roomPair) {
      return {
        participant1: R.find(function (member) { return member.id() === roomPair.participant1Id; }, memberList),
        participant2: R.find(function (member) { return member.id() === roomPair.participant2Id; }, memberList)
      };
    }, this.roomPairsFor(roomType));
  }
}

module.exports = RoomsReadModel;
