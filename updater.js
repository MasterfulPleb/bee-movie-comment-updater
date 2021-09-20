'use strict';
const mariadb = require('mariadb');
const snoowrap = require('snoowrap');
const login = require('./login.json');
const fs = require('fs/promises')

var script = require('./script.json');
const scriptCopy = script;
var written = '';
var lastCommentID = '';
var noError = true;
var errors = 0

var r = new snoowrap(login);
var pool = mariadb.createPool({
    socketPath: '/var/run/mysqld/mysqld.sock',
    user: 'root',
    database: 'bee_movie',
    connectionLimit: 5,
});
/**@type {mariadb.PoolConnection} */
var conn;

main();

async function main() {
    conn = await pool.getConnection();
    lastCommentID = await conn.query('SELECT ID ' +
        'FROM comments ORDER BY timestamp DESC LIMIT 1;');
    lastCommentID = lastCommentID[0].ID;
    await configureScript();
    pullComments();
}
async function configureScript() {
    script = script.script;
    var arr = await conn.query('SELECT body FROM comments;');
    for (let i = 0; i < arr.length; i++) {
        if (script.slice(0, 1) == arr[i].body) {
            script = script.slice(1);
            written += arr[i].body;
        } else throw console.error('error matching letters with script @ ' + i);
    }
}
async function pullComments() {
    try {
        /** @type {Promise<snoowrap.Comment>} */
        var lastComment = await r.getComment(lastCommentID).expandReplies({limit: 10, depth: 1});
        var moreComments = lastComment.replies.length > 0;
        if (!moreComments) console.log('no more comments');
        var restart = false;
        while (moreComments) {
            if (lastComment.replies.length == 1) {               //if only one reply
                if (lastComment.replies[0].body.trim().length == 1) {     //if that one reply is a single character
                    errorCheck(lastComment.replies[0].body.trim(), 0);
                    if (noError) {                                   //if that character matches the script
                        if (lastComment.replies[0].replies.length > 0) {          //check for valid replies
                            var validReply = false;
                            for (let replyReply of lastComment.replies[0].replies) {
                                if (replyReply.body.trim().length == 1) {                  //if one character
                                    errorCheck(replyReply.body.trim(), 1);                   //and matches script
                                    if (noError) validReply = true;                     //mark parent as valid
                                }
                            }
                            if (validReply) {                                     //if there is a valid reply
                                lastComment = lastComment.replies[0];               //push comment to db
                                await pushToDB(lastComment);
                            } else {                                              //if there is no valid reply
                                console.log('one reply - single character - character matches script - waiting for valid reply');
                                console.log(lastComment.replies[0].replies[0].body)
                                errors++;
                                moreComments = false;
                            }
                        } else {
                            console.log('one reply - single character - character matches script - waiting for replies');
                            moreComments = false;
                        }
                    } else {                                         //if that character does not match the script
                        console.warn('one reply - single character - character does not match script');
                        errors++;
                        moreComments = false;
                    }
                } else {                                           //if that one reply is multiple characters
                    console.warn('one reply - reply contains multiple characters');
                    errors++;
                    moreComments = false;
                }
            } else {                                             //if multiple replies
                var validReplies = [];
                for (let reply of lastComment.replies) {
                    if (reply.body.trim().length == 1) {    //if one character
                        errorCheck(reply.body.trim(), 0);        //and matches script
                        if (noError) validReplies.push(reply);//add parent to validReplies
                    }
                }
                if (validReplies.length == 0) {                    //and none match script
                    console.warn('multiple replies - none match script - id: ' + lastComment.id);
                    errors++;
                    moreComments = false;
                } else if (validReplies.length == 1) {             //and one matches script
                    lastComment = validReplies[0];
                    await pushToDB(lastComment);
                    moreComments = lastComment.replies.length > 0;
                } else {                                           //and multiple match the script
                    var temp = validReplies;
                    validReplies = [];
                    for (let reply of temp) {   //check replies of replies for valid replies
                        if (reply.replies.length > 0) {
                            for (let replyReply of reply.replies) {
                                if (replyReply.body.trim().length == 1) {    //if one character
                                    errorCheck(replyReply.body.trim(), 1);          //and matches script
                                    if (noError) validReplies.push(reply);   //add parent to validReplies
                                }
                            }
                        }
                    }
                    if (validReplies.length == 0) {
                        console.warn('multiple valid replies - no valid reply replies');
                        errors++;
                        moreComments = false;
                    } else if (validReplies.length > 1) {
                        console.error('multiple valid replies - multiple valid reply replies');
                        errors++;
                        moreComments = false;
                    } else {
                        lastComment = validReplies[0];
                        await pushToDB(lastComment);
                    }
                }
            }
        }
        lastCommentID = lastComment.id;
    } catch (err) {
        console.error(err)
    } finally {
        if (errors > 10) restart = true;
        if (restart) softRestart();
        else setTimeout(pullComments, 1200);
    }
}
function errorCheck(letter, depth) {
    if (script.slice(depth, depth + 1) == letter) noError = true;
    else noError = false;
}
async function pushToDB(c) {
    written += script.slice(0, 1);
    script = script.slice(1);
    await fs.writeFile('./remaining.txt', script)
    await fs.writeFile('./written.txt', written)
    console.log('pushing comment to DB... ' + c.body);
    return conn.query('INSERT INTO comments ' +
            '(ID,body,author,timestamp,parentID,permalink,edited,OP,awards)' +
            'VALUES("' + c.id + '","' + c.body.trim() + '","' + c.author.name + '",' +
            c.created_utc + ',"' + c.parent_id.slice(3) + '","' + c.permalink + '",' +
            (c.edited > 0) + ',' + c.is_submitter + ',' + c.total_awards_received + ');')
        .catch(err => {
            throw console.error('sql INSERT query error')
        });
}
async function softRestart() {
    script = scriptCopy;
    written = '';
    lastCommentID = '';
    errors = 0;
    r = new snoowrap(login);
    await conn.release();
    main();
}