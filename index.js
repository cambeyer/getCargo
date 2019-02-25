const request = require('request');
const fs = require('fs');
const pLimit = require('p-limit');

const limit = pLimit(300); // Amount of parallelization of promises allowed

const START_BOX_NUMBER = 1000;
const END_BOX_NUMBER = 99999;

const OUTPUT_FILE = 'cargo.csv'; // WARNING: will delete and overwrite output file each time the script is run

let outputFile = fs.createWriteStream(OUTPUT_FILE, {'flags': 'w'});
outputFile.write("Box,Qty,Name,Price,Free,Location\n");

const ENDPOINT = "https://havoc-production.herokuapp.com/graphql";

/* WARNING: Do not modify payloads*/
const PAYLOAD_1 = '{"query":"query BoxQuery(\\n  $cargoUid: String!\\n  $cartId: ID\\n  $retailOnly: Boolean\\n) {\\n  cargo(cargo_uid: $cargoUid) {\\n    id\\n    uid\\n    active\\n    max_free\\n    seatgeek_eligible_market_name\\n    digital_items {\\n      id\\n      name\\n      genre\\n      retail_price\\n      srp_price\\n      cover_image_url\\n      header_image_url\\n      digital_item_details {\\n        id\\n        title\\n        synopsis\\n        copyright\\n        genre\\n        trailer\\n        rating\\n        cover_image_url\\n      }\\n    }\\n    user {\\n      square_enabled\\n      freeze_payments\\n      id\\n    }\\n  }\\n  inventoryItems(cargo_uid: $cargoUid, retail_only: $retailOnly) {\\n    id\\n    quantity\\n    free\\n    free_count\\n    retail_price\\n    item {\\n      id\\n      name\\n      description\\n      primary_image_url\\n      primary_image_url_large\\n      secondary_image_url\\n      secondary_image_url_large\\n      age_requirement\\n      info_usage_text\\n      info_usage_video\\n    }\\n  }\\n  cart(id: $cartId) {\\n    id\\n    raw_quantities\\n    raw_digital_quantities\\n    selected_free\\n    tip_amount_cents\\n    box_created_at\\n  }\\n}\\n","variables":{"cargoUid":"';
const PAYLOAD_2 = '","cartId":"","retailOnly":false}}';

const makeRequest = (number, resolve, reject) => {
    let boxNumber = number.toString().padStart(4, "0");
    console.log("Fetching: " + boxNumber);
    request.post(ENDPOINT, {
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: PAYLOAD_1 + boxNumber + PAYLOAD_2
    }, (err, httpResponse, body) => {
        let data;
        try { data = JSON.parse(body); } catch (e) {}
        if (!err && data && data.data && data.data.cargo && data.data.cargo.uid) {
			console.log("Resolved " + boxNumber);
			resolve({ boxNumber, data });
        } else {
			console.log("Rejected " + boxNumber + (err ? " " + err : ""));
			reject({ boxNumber });
		}
    });
};

Promise.all([...Array(END_BOX_NUMBER - START_BOX_NUMBER + 1).keys()].map((number) =>
	limit(() =>
		new Promise((resolve, reject) => {
			makeRequest(number + START_BOX_NUMBER, resolve, reject);
		}).catch((err) => err)
	)
)).then((results) => {
	console.log("Got results");
	results = results.filter((result) => result.data);
	console.log("Filtered results");
	results.sort((result1, result2) => parseInt(result1.data.data.cargo.uid) - parseInt(result2.data.data.cargo.uid));
	console.log("Sorted results");
	results.forEach((result) => {
		const { data } = result;
		const { boxNumber } = result;
		const items = data.data.inventoryItems;
		if (items != null && items.length > 0) {
			outputFile.write(boxNumber + ',,,,' + data.data.cargo.max_free + ',' + (data.data.cargo.seatgeek_eligible_market_name || '') + '\n');
			items.forEach((item) => {
				const lineEnd = item.free ? ',' + item.free_count + '\n' : '\n';
				item.retail_price = item.retail_price.split(',').join('.');
				outputFile.write(',' + item.quantity + "," + item.item.name + ',' + item.retail_price + lineEnd);
				console.log(boxNumber + " " + item.item.name + " " + item.retail_price);
			});
		}
	});
}).catch((err) => {
	console.error(err);
}).finally(() => {
	outputFile.end();
});
