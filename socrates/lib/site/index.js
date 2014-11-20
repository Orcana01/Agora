'use strict';

var path = require('path');
var async = require('async');
var fs = require('fs');
var jwt = require('jwt-simple');
var passport = require('passport');

var conf = require('nconf');
var beans = conf.get('beans');
var Renderer = beans.get('renderer');
var misc = beans.get('misc');
var sponsors = require('./sponsors.json');
var jwt_secret = conf.get('jwt_secret');

var app = misc.expressAppIn(__dirname);

app.get('/', function (req, res, next) {
  res.render('index', {sponsors: sponsors, swkPublicUrl: conf.get('softwerkskammerURL'), currentUrl: 'loggedIn'});
});

app.get('/loggedIn', function (req, res, next) {
  var token = jwt.decode(req.query.id_token, jwt_secret);
  if (!token.userId) {
    return next(new Error("Authentication failed."));
  }
  req._passport.session.user = {authenticationId: token.userId};
  passport.authenticate('session')(req, res, function () {
    console.log("Hallo " + req.user.member.displayName());
    res.redirect('/');
  });
});

app.get('/robots.txt', function (req, res, next) {
  fs.readFile(path.join(__dirname, 'views', 'robots.txt'), 'utf8', function (err, data) {
    if (err) { return next(err); }
    res.send(data);
  });
});

app.get('/impressum.html', function (req, res) {
  res.render('impressum');
});

app.get('/schedule.html', function (req, res) {
  res.render('schedule');
});

app.get('/location.html', function (req, res) {
  res.render('location');
});

app.get('/history.html', function (req, res) {
  res.render('history');
});

app.get('/values.html', function (req, res) {
  res.render('values');
});

app.get('/sponsoring.html', function (req, res) {
  res.render('sponsoring');
});

module.exports = app;
