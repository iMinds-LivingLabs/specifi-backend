var _ = require('underscore'),
    keystone = require('keystone');
var Challenge = keystone.list('Challenge'),
    User = keystone.list('User'),
    Waypoint = keystone.list('Waypoint'),
    UserChallenge = keystone.list('UserChallenge'),
    UserGeneratedContent = keystone.list('UserGeneratedContent');
    moment = require('moment'),
    logUtils = require('../../lib/util/log-utils'),
    i18n = require('i18next');

/*
* Get a specific UserChallenge
* */
exports.get = function(req, res) {
    populateUserChallenge({challenge: req.params.challengeid, user: req.user._id, complete: false}, function(err,userChallenge) {
        if(err) return res.apiError('1000', i18n.t('1000'));
        if(!userChallenge) return res.apiError('1025', i18n.t('1025'));
        return res.apiResponse(userChallenge);
    });
}

/*
 * Start challenge for user
 * */
exports.start = function(req, res) {
    Challenge.model.findById(req.params.challengeid).exec(function(err, challenge) {
        if(err) return res.apiError('1000', i18n.t('1000'));
        if(!challenge) return res.apiError('1021', i18n.t('1021'));
        if(challenge.status === 0) { return res.apiError('1034', i18n.t('1034')); }
        UserChallenge.model.findOne({challenge: req.params.challengeid, user: req.user._id, complete: true}).exec(function(err, found){
            if(found && !challenge.repeatable) { return res.apiError('1030', i18n.t('1030')); }
            
            //TODO why is this done twice?
            findUserChallenge({challenge: req.params.challengeid, user: req.user._id, complete: false}, function(err, userChallenge) {
                if(userChallenge) return res.apiError('1022', i18n.t('1022'));
                var extra = false;
                if(req.params.extra ==='true') {
                    extra = true;
                }
                var newUserChallenge = new UserChallenge.model({ user: req.user, challenge: challenge, start: moment(), extradifficulty: extra });
                newUserChallenge.save(function(err) {
                    if(err) return res.apiError('1000', i18n.t('1000'));
                    var populateOpts = [ { path:'challenge', model:'Challenge' },
                        { path: 'user', model:'User' }, { path:'completedWP hintsUsed', model:'Waypoint' } ];

                    UserChallenge.model.populate(newUserChallenge, populateOpts, function(err, userChallenge){
                        if(err || !userChallenge) return res.apiError('1000', i18n.t('1000'));
                        Waypoint.model.populate(userChallenge, { path: 'challenge.waypoints', model:'Waypoint' },function(err, userChallenge) {
                            if(err) return res.apiError('1000', i18n.t('1000'));
                            userChallenge.getMediaHavenUrls(function(userChallenge) {
                                return res.apiResponse(userChallenge);
                            });
                        });
                    });
                });
            });
        });
    });
}

/*
 * Stop challenge for user
 * */
exports.stop = function(req, res) {
    findUserChallenge({challenge: req.params.challengeid, user: req.user._id, complete: false}, function(err, userChallenge) {
        if(err) return res.apiError('1000', i18n.t('1000'));
        if(!userChallenge) return res.apiError('1023', i18n.t('1023'));
        userChallenge.remove(function(err, userChallenge) {
            if(err || !userChallenge) return res.apiError('1023', i18n.t('1023'));
            userChallenge.getMediaHavenUrls(function(userChallenge) {
                return res.apiResponse(userChallenge);
            });
        });
    });
}

/*
 * Complete waypoint for challenge for user
 * */
exports.completeWP = function(req, res) {
    Waypoint.model.findOne({_id:req.body.wpid}).exec(function(err, waypoint){
        if(err || !waypoint) { return res.apiError('1031', i18n.t('1031')) }
        
        var ugc = (req.files)? req.files['content_upload'] : null;
        if(waypoint.type === 'ugc' && waypoint.ugcType === 'text') {
            ugc = req.body.contentText;
        }
        completeWaypointForUserChallenge(req.body.challengeid, req.user, waypoint, ugc, req, function(err, userChallenge) {
            if(err) { return res.apiError(err, i18n.t(err)); }
            return res.apiResponse(userChallenge);
        });
    });
}


/*
 * Complete waypoint for challenge with QR
 * */
exports.completeWPWithQR = function(req, res) {
    Waypoint.model.findOne({qr:req.body.qrcode}).exec(function(err, waypoint){
        if(err || !waypoint) { return res.apiError('1031', i18n.t('1031')) }

        var ugc = (req.files)? req.files['content_upload'] : null;
        if(waypoint.type === 'ugc' && waypoint.ugcType === 'text') {
            ugc = req.body.contentText;
        }

        completeWaypointForUserChallenge(req.body.challengeid, req.user, waypoint, ugc, req, function(err, userChallenge) {
            if(err) { return res.apiError(err, i18n.t(err)); }
            return res.apiResponse(userChallenge);
        });
    });
    
}


/*
 * Complete waypoint for challenge with Beacon
 * */
exports.completeWPWithBeacon = function(req, res) {
    Waypoint.model.findOne({_id: req.body.wpid, beaconUUID:req.body.beacon}).exec(function(err, waypoint){
        if(err || !waypoint) { return res.apiError('1031', i18n.t('1031')) }

        var ugc = (req.files)? req.files['content_upload'] : null;
        if(waypoint.type === 'ugc' && waypoint.ugcType === 'text') {
            ugc = req.body.contentText;
        }

        completeWaypointForUserChallenge(req.body.challengeid, req.user, waypoint, ugc, req, function(err, userChallenge) {
            if(err) { return res.apiError(err, i18n.t(err)); }
            return res.apiResponse(userChallenge);
        });
    });
}

/*
* Mark a hint as used
* */
exports.usedHint = function (req, res) {
    if(req.user.score < keystone.get('hintCost')) {
        return res.apiError('1028', i18n.t('1028'));
    }
    
    Waypoint.model.findOne({_id:req.params.wpid}).exec(function(err, waypoint){
        if(err || !waypoint) { return res.apiError('1031', i18n.t('1031')) }
        
        populateUserChallenge({challenge: req.params.challengeid, user: req.user._id, complete: false}, function(err, userChallenge){
            if(err) return res.apiError('1000', i18n.t('1000'));
            if(!userChallenge) return res.apiError('1025', i18n.t('1025'));

            var checkIfPresent = _.find(userChallenge.challenge.waypoints, function(wp){
                if(wp._id.toString() === waypoint._id.toString()) {
                    return true;
                }
                return false;
            });
            if(checkIfPresent === undefined) { return res.apiError('1033', i18n.t('1033')); }
            
            
            if(!userChallenge.hintsUsed) { userChallenge.hintsUsed = []; }
            
            var checkIfHintUsed = _.find(userChallenge.hintsUsed, function(wp){
                if(wp.toString() === waypoint._id.toString()) {
                    return true;
                }
                return false;
            });
            if(checkIfHintUsed !== undefined) { return res.apiError('1029', i18n.t('1029')); }
            
            userChallenge.hintsUsed.push(waypoint._id);
            
            userChallenge.save(function(err, userChallenge) {
                if(err || !userChallenge) return res.apiError('1000', i18n.t('1000'));
                req.user.score-=parseInt(keystone.get('hintCost'));
                req.user.save(function(err, user) {
                    if(err) return callback('1000');
                    userChallenge.user = user;
                    userChallenge.getMediaHavenUrls(function(userChallenge) {
                        logUtils.logPoints([{user: req.user._id, action: userChallenge.id, actionType:logUtils.USERCHALLENGE, score: Math.abs(parseInt(keystone.get('hintCost')))*-1}],
                            function(err){
                                return res.apiResponse(userChallenge);
                        });
                    });
                });
            });
        });
    });
}

//***********************UTILS***********************//

/*
* Generic complete waypoint method
* */
function completeWaypointForUserChallenge(challengeId, user, waypoint, ugc, req, callback) {
    //If the waypoint is of User Generated Content type throw an error if none is provided or if it's the wrong filetype
    if(waypoint.type === 'ugc') {
        if(!ugc) return callback('1042');
        var isRightFileType = false;
        switch(waypoint.ugcType) {
            case 'video':
                isRightFileType = (_.contains(['video/mp4', "video/mov", "video/3gpp", "video/quicktime", "video/mpeg"], ugc.type))?true:false;
                break;
            case 'text':
                isRightFileType = (typeof ugc === 'string')?true:false;
                break;
            case 'picture':
                isRightFileType = (_.contains(["image/png", "image/jpeg", "image/gif"], ugc.type))?true:false;
                break;
        }
        if(!isRightFileType) return callback('1043');
    } 
    
    populateUserChallenge({challenge: challengeId, user: user._id, complete: false}, function(err, userChallenge){

        if(err) return callback('1000');
        if(!userChallenge) return callback('1025');

        if(!userChallenge.completedWP) userChallenge.completedWP = [];

        var checkIfPresent = _.find(userChallenge.challenge.waypoints, function(wp){
            if(wp._id.toString() === waypoint._id.toString()) {
                return true;
            }
            return false;
        });
        if(checkIfPresent === undefined) { return callback('1033'); }

        var checkIfCompleted = _.find(userChallenge.completedWP, function(wp){
            if(wp.toString() === waypoint._id.toString()) {
                return true;
            }
            return false;
        });
        if(checkIfCompleted !== undefined) { return callback('1032'); };

        userChallenge.completedWP.push(waypoint._id);

        var wpIndex = -1;
        for(i=0; i < userChallenge.challenge.waypoints.length; i++) {
            if(userChallenge.challenge.waypoints[i]._id.toString() === waypoint._id.toString()) {
                wpIndex = i;
                break;
            }
        }
        
        if(userChallenge.completedWP.indexOf(waypoint._id) != wpIndex) {
            return callback('1027');
        }
        
        if(userChallenge.completedWP.length === userChallenge.challenge.waypoints.length){
            userChallenge.complete = true;
            userChallenge.end = moment();
            userChallenge.score = userChallenge.challenge.tokens;
            if(userChallenge.extradifficulty && userChallenge._.end.moment().diff(userChallenge._.start.moment(), 'seconds') < (userChallenge.challenge.timelimit * 60)) {
                userChallenge.score+=userChallenge.challenge.extratokens;
            }
        }

        userChallenge.save(function(err, userChallenge) {
            if(err || !userChallenge) return callback('1000');
            if(waypoint.type === 'ugc') {
                var contentData = {
                    challenge: challengeId,
                    waypoint: waypoint._id,
                    user: user._id,
                    userchallenge:userChallenge._id
                };
                
                if(waypoint.ugcType ==='text') {
                    contentData.contentText = ugc;
                } else {
                    contentData.content = ugc;
                }

                var userGeneratedContent = new UserGeneratedContent.model(contentData);

                userGeneratedContent.getUpdateHandler(req).process(contentData, {ignoreNoedit: true},function(err) {
                    if(userChallenge.complete) {
                        user.score+=userChallenge.score;

                        user.save(function(err, user) {
                            if(err) return callback('1000');
                            userChallenge.user = user;
                            userChallenge.getMediaHavenUrls(function(userChallenge) {
                                logUtils.logPoints([{user: req.user._id, action: userChallenge.id, actionType:logUtils.USERCHALLENGE, score: userChallenge.score}],
                                    function(err){
                                        return callback(null, userChallenge);
                                });
                            });
                        });
                    } else {
                        userChallenge.getMediaHavenUrls(function(userChallenge) {
                            return callback(null, userChallenge);
                        });
                    }
                });
            } else {
                if(userChallenge.complete) {
                    user.score+=userChallenge.score;

                    user.save(function(err, user) {
                        if(err) return callback('1000');
                        userChallenge.user = user;
                        userChallenge.getMediaHavenUrls(function(userChallenge) {
                            logUtils.logPoints([{user: req.user._id, action: userChallenge.id, actionType:logUtils.USERCHALLENGE, score: userChallenge.score}],
                                function(err){
                                    return callback(null, userChallenge);
                            });
                        });
                    });
                } else {
                    userChallenge.getMediaHavenUrls(function(userChallenge) {
                        return callback(null, userChallenge);
                    });
                }
            }
        });
    });
}


/*
 * Find UserChallenge, don't populate
 * */
function findUserChallenge(options, callback) {
    UserChallenge.model.findOne(options)
        .exec(function(err, userChallenge) {
            if(err) return callback(err);
            return callback(err, userChallenge);
        });
}

/*
 * Find UserChallenge and populate everything but challenge.waypoints
 * */
function populateUserChallenge(options, callback) {
    UserChallenge.model.findOne(options)
        .populate('user challenge')
        .exec(function(err, userChallenge) {
            if(err) return callback(err);
            UserChallenge.model.populate(userChallenge, {path: 'challenge.waypoints', model:'Waypoint'}, function(err, userChallenge) {
                if(err || !userChallenge){ return callback(err, userChallenge); }
                userChallenge.getMediaHavenUrls(function(userChallenge) {
                    return callback(err, userChallenge);
                });
            });
        });
}
