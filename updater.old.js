'use strict';
//const mariadb = require('mariadb');
const snoowrap = require('snoowrap');
const login = require('./login.json');
var script = require('./script.json');
var written = '';
const r = new snoowrap(login);
/*const pool = mariadb.createPool({
    socketPath: '/var/run/mysqld/mysqld.sock',
    user: 'root',
    database: 'bee_movie',
    connectionLimit: 5,
});*/


function configureScript() {
    script = script.script;
    var arr = conn.query('SELECT body FROM comments;');
    for (i = 0; i < arr.length; i++) {
        if (script.slice(0, 1) == arr[i].body) {
            script = script.slice(1);
            written += arr[i].body;
        } else throw console.error('error matching letters with script @ ' + i);
    }
}
function errorCheck(letter) {
    if (script.slice(0, 1) == letter) noError = true;
    else noError = false;
}

main();

function main() {
    //var conn = await pool.getConnection();
    var lastCommentID = 'hcd93hi';/*await conn.query('SELECT ID ' +
    'FROM comments ORDER BY timestamp DESC LIMIT 1;');
    lastCommentID = lastCommentID[0].ID;*/
    configureScript();
    let pullComments = setInterval(async function() {
        /** @type {Promise<snoowrap.Comment>} */
        var lastComment = await r.getComment(lastCommentID).expandReplies({limit: 10, depth: 1});
        var moreComments = lastComment.replies.length > 0;
        if (!moreComments) console.warn('no more comments');
        var noError = true;
        while (moreComments) {
            if (lastComment.replies.length == 1) {               //if only one reply
                if (lastComment.replies[0].body.length == 1) {     //if that one reply is a single character
                    errorCheck(lastComment.replies[0].body);
                    if (noError) {                                   //if that character matches the script
                        lastComment = lastComment.replies[0];
                        pushToDB(lastComment);
                        moreComments = lastComment.replies.length > 0;
                    } else {                                         //if that character does not match the script
                        console.warn('one reply - single character - character does not match script');
                        moreComments = false;
                    }
                } else {                                           //if that one reply is multiple characters
                    console.warn('one reply - reply contains multiple characters');
                    moreComments = false;
                }
            } else {                                             //if multiple replies
                var validReplies = [];
                for (let reply of lastComment.replies) {
                    if (reply.body.length == 1) {    //if one character
                        errorCheck(reply.body);          //and matches script
                        if (noError) validReplies.push(reply);//add to validReplies
                    }
                }
                if (validReplies.length == 0) {                    //and none match script
                    console.warn('multiple replies - none match script');
                    moreComments = false;
                } else if (validReplies.length == 1) {             //and one matches script
                    lastComment = validReplies[0];
                    pushToDB(lastComment);
                    moreComments = lastComment.replies.length > 0;
                } else {                                           //and multiple match the script
                    var temp = validReplies;
                    validReplies = [];
                    for (let reply of temp) {   //check replies of replies for valid replies
                        if (reply.replies.length > 0) {
                            for (let replyReply of reply.replies) {
                                if (replyReply.body.length == 1) {    //if one character
                                    errorCheck(replyReply.body);          //and matches script
                                    if (noError) validReplies.push(reply);   //add parent to validReplies
                                }
                            }
                        }
                    }
                    if (validReplies.length == 0) {
                        console.warn('multiple valid replies - no valid reply replies');
                        moreComments = false;
                    } else if (validReplies.length > 1) {
                        console.warn('multiple valid replies - multiple valid reply replies');
                        clearInterval(pullComments);
                    } else {
                        lastComment = validReplies[0];
                        pushToDB(lastComment);
                        moreComments = true;
                    }
                }

            }
        }
        lastCommentID = lastComment.id;
    }, 1000000000); //set to reasonable interval
    debugger;
    console.log(lastComment);
    //if (lastComment.replies.length == 0)
    
}

function pushToDB(comment) {
    console.log('pushing comment to DB...')
}