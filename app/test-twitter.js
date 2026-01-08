import { Scraper } from '@the-convocation/twitter-scraper';

async function test() {
    const scraper = new Scraper();
    try {
        console.log('Fetching tweets for 8823min...');
        // getTweetsはイテレータを返す
        const query = 'from:8823min';
        let count = 0;
        for await (const tweet of scraper.getTweets(query, 10)) {
            console.log(`Tweet: ${tweet.text} (${tweet.timeParsed})`);
            count++;
        }
        console.log(`Finished. Total count: ${count}`);
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
