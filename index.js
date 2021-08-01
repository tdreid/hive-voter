const config = require('config');
const schedule = require('node-schedule');
const moment = require('moment');
const { Client, PrivateKey } = require('@hiveio/dhive');
const log4js = require('log4js');
const logger = log4js.getLogger();
logger.level = config.get('logLevel');

const client = new Client(config.get('hiveNode'));
const bloggers = config.get('bloggers').split(',');
const curator = config.get('curator');

schedule.scheduleJob(config.get('schedule'), () => {
    const candidates = [];
    Promise.all(
        bloggers.map((blogger) =>
            client.database
                .getDiscussions('blog', {
                    limit: config.get('maxPostsPerBlogger'),
                    tag: blogger,
                })
                .then((results) =>
                    results
                        .filter(
                            (post) =>
                                !moment(post.created).isBefore(
                                    moment().subtract(7, 'days')
                                ) &&
                                post.active_votes.filter(
                                    (vote) => vote.voter === curator
                                ).length === 0
                        )
                        .forEach((post) => {
                            candidates.push(post);
                        })
                )
                .catch((err) => {
                    logger.error(`Error: ${err}`);
                })
        )
    ).then(() => {
        if (candidates.length) {
            logger.info('Found for potential curation:');
            candidates
                .sort(
                    (a, b) =>
                        moment(b.created).valueOf() -
                        moment(a.created).valueOf()
                )
                .forEach((post, idx) =>
                    logger.info(
                        `${idx}:'${post.title}' posted by ${
                            post.author
                        } ${moment.utc(post.created).fromNow()}`
                    )
                );
            logger.info('Attempting vote...');
            const post = candidates[0];
            const key = PrivateKey.fromString(config.get('postingKey'));
            const vote = {
                voter: curator,
                author: post.author,
                permlink: post.permlink,
                weight: config.get('voteWeight'),
            };
            logger.info(vote);
            client.broadcast
                .vote(vote, key)
                .then((result) => logger.info('success:', result))
                .catch((err) => logger.error('error:', err));
        } else {
            logger.info('Found nothing to curate.');
        }
    });
});
