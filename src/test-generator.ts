import * as uuidv1 from 'uuid/v1';
import * as fs from 'fs';
import * as commandLineArgs from 'command-line-args';
import * as commandLineUsage from 'command-line-usage';

import { PostmanCollection } from './PostmanCollection';
import { Folder } from './Folder';
import { Request } from './Request';
import { QueryParam } from './QueryParam';
import { RequestDefinition } from './RequestDefinition';
import { Attribute } from './Attribute';

let swagger;
let output;
const owner = 231421;

function processArgs() {
	const optionDefinitions = [
	  { name: 'input', alias: 'i', type: String },
	  { name: 'output', alias: 'o', type: String },
	  { name: 'help', alias: 'h', type: Boolean }
	];

	const options = commandLineArgs(optionDefinitions)

	if (options.help) {
		const sections = [
		  {
			header: 'test-generator',
			content: 'Generates a {italic postman-collection} from a {italic swagger.json} file.'
		  },
		  {
			header: 'Options',
			optionList: [
			  {
				name: 'input',
				typeLabel: '{underline file}',
				description: 'The swagger.json input file.'
			  },
			  {
				name: 'output',
				typeLabel: '{underline file}',
				description: 'The postman-collection output file.'
			  },
			  {
				name: 'help',
				description: 'Print this usage guide.'
			  }
			]
		  }
		]
		const usage = commandLineUsage(sections)
		console.log(usage)
	} else {
		if (options.input) {
			const rawdata = fs.readFileSync(options.input);
			swagger = JSON.parse(rawdata.toString('utf8'));
		} else {
			console.log('Input file is missing');
		}
		if (options.output) {
			output = options.output;
		}
	}
}

function generateBasicRequest(collectionId: string, folder: string, req: RequestDefinition): Request {
	const request = {
		id: uuidv1(),
		name: req.summary,
		description: req.description,
		headers: 'Accept: application/json\nContent-Type: application/json\n',
		headerData: [
			{
				"key": "Accept",
				"value": "application/json",
				"description": "",
				"enabled": true
			},
			{
				"key": "Content-Type",
				"value": "application/json",
				"description": "",
				"enabled": true
			}
		],
		url: '',
		folder: folder,
		queryParams: [],
		preRequestScript: '',
		method: '',
		data: [],
		dataMode: 'raw',
		version: 2,
		tests: '',
		currentHelper: 'normal',
		time: Date.now(),
		collectionId: collectionId,
		rawModeData: ''
	};
	return request;
}

function resolveModel(obj: Attribute): Attribute{
	if (obj['$ref']) {
		const referencedModel = swagger.definitions[obj['$ref'].substring(obj['$ref'].lastIndexOf('/') + 1)]
		return resolveModel(referencedModel);
	} else if (obj.allOf) {
		let result = {};
		for (const a of obj.allOf) {
			result = Object.assign(result, resolveModel(a));
		}
		return result;
	} else {
		return obj;
	}
}

function buildModelWithAllAttributes(model: Attribute): any {
	let result;
	if (model.type === 'object' || !model.type) {
		if (model.allOf) {
			result = {};
			for (const a of model.allOf) {
				if (Object.keys(a).length > 0) {
					result = Object.assign(result, buildModelWithAllAttributes(a));
				}
			}
		} else if (model['$ref']) {
			result = buildModelWithAllAttributes(resolveModel(model));
		} else {
			if (model.properties) {
				const subObject = {};
				for (const prop of Object.keys(model.properties)) {
					subObject[prop] = buildModelWithAllAttributes(model.properties[prop]);
				}
				result = subObject;
			} else {
				result = {};
			}
		}
	} else if (model.type === 'array') {
		result = [];
		result.push(buildModelWithAllAttributes(model.items));
	} else {
		result = model.example;
	}
	return result;
}

function deleteOptionalAttributes(result: any, required: string[]) {
	for (const r of Object.keys(result)) {
		if (required.find((f) => f === r) === undefined) {
			delete result[r];
		}
	}
}

function deleteAllOptionalAttributes(result: any, model: Attribute) {
	if (model.type === 'object' || !model.type) {
		if (model.allOf) {
			let required = [];
			for (const a of model.allOf) {
				if (Object.keys(a).length > 0) {
					deleteAllOptionalAttributes(result, a);
				}
				if (a.required) {
					required = required.concat(a.required);
				}
			}
			deleteOptionalAttributes(result, required);
		} else if (model['$ref']) {
			deleteAllOptionalAttributes(result, resolveModel(model));
		} else {
			if (model.properties) {
				for (const prop of Object.keys(model.properties)) {
					deleteAllOptionalAttributes(result[prop], model.properties[prop]);
				}
			}
			if (model.required) {
				deleteOptionalAttributes(result, model.required);
			}
		}
	} else if (model.type === 'array') {
		buildModelWithAllAttributes(model.items);
	} else {
		// Nothing to, because no required attribute in elementary datatypes
	}
}

function buildModelWithRequiredAttributes(model: Attribute): any {
	if (model.required && model.required.length > 0) {
		const a = {};
		for (const r of model.required) {
			if (!model.properties[r].readOnly) {
				if (model.properties[r].example) {
					a[r] = model.properties[r].example;
				} else {
					console.warn('Generate a default value, if the example attribute is not present');
				}
			}
		}
		return a;
	}
}

function addTestsForMissingMandatoryParameters(p: PostmanCollection) {
	const folder = {
		id: uuidv1(),
		name: 'TC_Resource_POST_E1 - Create Resource with missing mandatory parameter',
		description: '',
		collectionId: p.id,
		order: [],
		owner: owner,
		folders_order: []
	};
	const paths = Object.keys(swagger.paths).map((key) => ({key, value: swagger.paths[key]}));
	const requests = new Array<Request>();
	for (const path of paths) {
		if (path.value.post) {
			const bodyContent = path.value.post.parameters.find((f) => f.in === 'body');
			const model = resolveModel(bodyContent.schema);
			const example = buildModelWithAllAttributes(bodyContent.schema);
			deleteAllOptionalAttributes(example, bodyContent.schema);
			for (const req of model.required) {
				const copy = JSON.parse(JSON.stringify(example));
				delete copy[req];
				const request = generateBasicRequest(p.id, folder.id, path.value.post);
				request.url = '{{basicUrl}}' + path.key;
				request.method = 'POST';
				request.tests += 'tests["Content-Type is present " + postman.getResponseHeader("Content-type")] = postman.getResponseHeader("Content-type");\n';
				request.tests += 'tests["Status code is an error"] = responseCode.code >= 400;\n';
				request.rawModeData = JSON.stringify(copy);
				folder.order.push(request.id);
				requests.push(request);
			}
		}
	}
	if (requests.length > 0) {
		p.requests = p.requests.concat(requests);
		p.folders.push(folder);		
	}
}

function generatePostmanCollection(): PostmanCollection {
	const p: PostmanCollection = {
		id: uuidv1(),
		name: swagger.info.title,
		description: swagger.info.description,
		order: new Array<string>(),
		folders: new Array<Folder>(),
		folders_order: new Array<string>(),
		timestamp: Date.now(),
		owner: owner,
		public: false,
		requests: new Array<Request>()
	};
	addTestsForMissingMandatoryParameters(p);
	return p;
}

processArgs();
const postmanCollection = generatePostmanCollection();
if (swagger) {
	if (output) {
		console.log('Writing to a file the following content');
		console.log(JSON.stringify(postmanCollection, null, 2));
	} else {
		console.log(JSON.stringify(postmanCollection, null, 2));
	}
}
