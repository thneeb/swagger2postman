import * as uuidv1 from 'uuid/v1';
import * as fs from 'fs';
import * as commandLineArgs from 'command-line-args';
import * as commandLineUsage from 'command-line-usage';

import { PostmanCollection } from './PostmanCollection';
import { Folder } from './Folder';
import { Request } from './Request';
import { QueryParam } from './QueryParam';
import { RequestDefinition } from './RequestDefinition';
import { RequestDefinitions } from './RequestDefinitions';
import { Attribute } from './Attribute';
import { Swagger } from './Swagger';

const owner = 231421;

function processArgs(): {swagger: any, output: string} {
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
		return null;
	} else {
		let s;
		let o;
			if (options.input) {
			const rawdata = fs.readFileSync(options.input);
			s = JSON.parse(rawdata.toString('utf8'));
		} else {
			console.log('Input file is missing');
		}
		if (options.output) {
			o = options.output as string;
		}
		return {swagger: s, output: o};
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

/**
 * Shallow resolve of an attribute. References in objects are not resolved.
 * TODO: The Attributes are only basically merged. Special handling for the 
 * attributes besind of properties and required are needed here.
 * @param swag the swagger definition
 * @param obj attribute to be resolved
 */
function resolveModel(swag: Swagger, obj: Attribute): Attribute{
	if (obj['$ref']) {
		const definitions = swag.definitions || swag.components.schemas;
		const referencedModel = definitions[obj['$ref'].substring(obj['$ref'].lastIndexOf('/') + 1)]
		return resolveModel(swag, referencedModel);
	} else if (obj.allOf) {
		let result = {} as Attribute;
		for (const a of obj.allOf) {
			const resolvedModel = resolveModel(swag, a);
			if (result.properties && resolvedModel.properties) {
				resolvedModel.properties = Object.assign(resolvedModel.properties, result.properties);
			}
			if (result.required && resolvedModel.required) {
				 const array = result.required.concat(resolvedModel.required);
				 resolvedModel.required = array.filter((item, pos, elements) => {
					 return elements.indexOf(item) === pos;
				 });
			}
			result = Object.assign(result, resolvedModel);
		}
		return result;
	} else {
		if (obj.oneOf && obj.oneOf.length > 0) {
			obj.properties = Object.assign(obj.properties, resolveModel(swag, obj.oneOf[0]).properties);
			obj.required = (obj.required || []).concat(Object.keys(resolveModel(swag, obj.oneOf[0]).properties)).filter((item, pos, items) => {
				return items.indexOf(item) === pos;
			});
		}
		return obj;
	}
}

function buildModelWithAllAttributes(swag: Swagger, model: Attribute): any {
	let result;
	if (model.type === 'object' || !model.type) {
		if (model.allOf) {
			result = {};
			for (const a of model.allOf) {
				if (Object.keys(a).length > 0) {
					result = Object.assign(result, buildModelWithAllAttributes(swag, a));
				}
			}
		} else if (model['$ref']) {
			result = buildModelWithAllAttributes(swag, resolveModel(swag, model));
		} else {
			result = {};
			if (model.properties) {
				const subObject = {};
				for (const prop of Object.keys(model.properties)) {
					subObject[prop] = buildModelWithAllAttributes(swag, model.properties[prop]);
				}
				result = subObject;
			}
			if (model.oneOf && model.oneOf.length > 0) {
				result = Object.assign(result, buildModelWithAllAttributes(swag, model.oneOf[0]));
			}
		}
	} else if (model.type === 'array') {
		result = [];
		result.push(buildModelWithAllAttributes(swag, model.items));
	} else {
		result = model.example;
	}
	return result;
}

function deleteOptionalAttributes(result: any, required: string[], readOnly: string[]) {
	for (const r of Object.keys(result)) {
		if (!required || !required.find((f) => f === r)) {
			delete result[r];
		}
		if (readOnly.find((f) => f === r)) {
			delete result[r];
		}
	}
}

/**
 * Delete all optional (not required attributes) from the given object.
 * TODO: This method must be improved for OAS3 in a way, that required readOnly
 * attributes are deleted in a request and required writeOnly attributes
 * are deleted in a response.
 * @param result the object where all optional attributes should be deleted
 * @param model the model which describes the object
 */
function deleteAllOptionalAttributes(swag: Swagger, result: any, model: Attribute) {
	if (model.type === 'object' || !model.type) {
		if (model.allOf) {
			let required = [] as string[];
			const readOnly = [] as string[];
			for (const a of model.allOf) {
				if (Object.keys(a).length > 0) {
					deleteAllOptionalAttributes(swag, result, a);
				}
				if (a.required) {
					required = required.concat(a.required);
				}
				if (a.properties) {
					for (const prop of Object.keys(a.properties)) {
						if (model.properties[prop].readOnly) {
							readOnly.push(prop);
						}
					}
				}
			}
			deleteOptionalAttributes(result, required, readOnly);
		} else if (model['$ref']) {
			deleteAllOptionalAttributes(swag, result, resolveModel(swag, model));
		} else {
			const readOnly = [] as string[];
			if (model.properties) {
				for (const prop of Object.keys(model.properties)) {
					deleteAllOptionalAttributes(swag, result[prop], model.properties[prop]);
					if (model.properties[prop].readOnly) {
						readOnly.push(prop);
					}
				}
			}
			if (model.oneOf) {
				let oneOfRequired = [] as string[];
				for (const attr of model.oneOf) {
					oneOfRequired = oneOfRequired.concat(Object.keys(resolveModel(swag, attr).properties));
				}
				model.required = model.required.concat(oneOfRequired).filter((item, pos, items) => {
					return items.indexOf(item) === pos;
				});
			}
			deleteOptionalAttributes(result, model.required, readOnly);
		}
	} else if (model.type === 'array' && Array.isArray(result) && result.length > 0) {
		deleteAllOptionalAttributes(swag, result[0], model.items);
	} else {
		// Nothing to, because no 'required' attribute in elementary datatypes
	}
}

function addTestsForMissingMandatoryParameters(swag: Swagger, p: PostmanCollection) {
	const paths = Object.keys(swag.paths).map((key) => ({key, value: swag.paths[key]}));
	for (const path of paths) {
		if (path.value.post) {
			const requests = new Array<Request>();
			const folder = generateFolder(p.id, 'TC_' + path.key.substring(1) + '_POST_E1 - Create Resource with missing mandatory parameter')
			const bodyContent = (path.value.post.requestBody && path.value.post.requestBody.content && path.value.post.requestBody.content['application/json']) || 
				(path.value.post.parameters && path.value.post.parameters.find((f) => f.in === 'body'));
			if (!bodyContent) {
				continue;
			}
			const model = resolveModel(swag, bodyContent.schema);
			const example = buildModelWithAllAttributes(swag, bodyContent.schema);
			deleteAllOptionalAttributes(swag, example, bodyContent.schema);
			const required = model.required.filter((f) => {
				return !model.properties[f].readOnly;
			})
			for (const req of required) {
				const copy = JSON.parse(JSON.stringify(example));
				delete copy[req];
				const request = generateBasicRequest(p.id, folder.id, path.value.post);
				request.url = '{{host}}{{path}}' + path.key;
				request.method = 'POST';
				request.tests += 'tests["Content-Type is present " + postman.getResponseHeader("Content-type")] = postman.getResponseHeader("Content-type");\n';
				request.tests += 'tests["Status code is an error"] = responseCode.code >= 400;\n';
				request.rawModeData = JSON.stringify(copy);
				folder.order.push(request.id);
				requests.push(request);
			}
			if (requests.length > 0) {
				p.requests = p.requests.concat(requests);
				p.folders.push(folder);		
			}
		}
	}
}

function addFindFieldsInBody(): string {
	let result = '\n';
	result += 'function findFieldInBody(field,body) {\n';
	result += '\tfor (var key in body) {\n';
	result += '\t\tif (key == field) return true;\n';
	result += '\t}\n';
	result += '\treturn false;\n';
	result += '}\n\n';
	result += 'function findFieldsInBody(fields,body) {\n';
	result += '\tif (Object.prototype.toString.call(body) === "[object Array]") {\n';
	result += '\t\tfor (var i = 0; i < body.length; i++) {\n';
	result += '\t\t\tfindFieldsInBody(fields,body[i]);\n';
	result += '\t\t}\n';
	result += '\t} else {\n';
	result += '\t\tfor (var k = 0; k < fields.length; k++) {\n';
	result += '\t\t\tif (!findFieldInBody(fields[k],body)) {\n';
	result += '\t\t\t\ttests["An element is missing the field " + fields[k]] = false;\n';
	result += '\t\t\t\treturn false;\n';
	result += '\t\t\t}\n';
	result += '\t\t}\n';
	result += '\t\treturn true\n';
	result += '\t}\n';
	result += '\treturn result;\n';
	result += '}\n';
	return result;
}

function addObjectEquals(): string {
	let result = '\n';
	result += 'function objectEquals(v1, v2) {\n';
	result += '\tif (typeof(v1) === "function") {\n';
	result += '\t\treturn v1.toString() === v2.toString();\n';
	result += '\t} else if (v1 instanceof Object && v2 instanceof Object) {\n';
	result += '\t\tvar r = true;\n';
	result += '\t\tfor (var k in v1) {\n';
	result += '\t\t\tr = objectEquals(v1[k], v2[k]);\n';
	result += '\t\t\tif (!r) {\n';
	result += '\t\t\t\tconsole.log("v1[k]:"+v1[k]+";v2[k]:"+v2[k]);\n';
	result += '\t\t\t\treturn false;\n';
	result += '\t\t\t}\n';
	result += '\t\t}\n';
	result += '\t\treturn true;\n';
	result += '\t} else {\n';
	result += '\t\treturn v1 === v2;\n';
	result += '\t}\n';
	result += '}\n';
	return result;
}

function generateFolder(collectionId: string, name: string): Folder {
	const folder = {
		id: uuidv1(),
		name: name,
		description: '',
		collectionId: collectionId,
		order: [],
		owner: owner,
		folders_order: []
	} as Folder;
	return folder;
}

function addTestsForSuccessfulMinimalCreation(swag: Swagger, p: PostmanCollection) {
	const paths = Object.keys(swag.paths).map((key) => ({key, value: swag.paths[key]}));
	for (const path of paths) {
		if (path.value.post) {
			const bodyContent = (path.value.post.requestBody && path.value.post.requestBody.content && path.value.post.requestBody.content['application/json']) || 
				(path.value.post.parameters && path.value.post.parameters.find((f) => f.in === 'body'));
			if (!bodyContent) {
				console.warn('no request body for POST Request ' + path.key + ' specified, searching for the next')
				continue;
			}
			const folder = generateFolder(p.id, 'TC_' + path.key.substring(1) + '_POST_N1 - Create Resource with minimum parameters')
			const example = buildModelWithAllAttributes(swag, bodyContent.schema);
			deleteAllOptionalAttributes(swag, example, bodyContent.schema);
			testCreateResource(swag, p, folder, path.key, path.value.post, example);
			const defs = swag.paths[path.key + "/{id}"] as RequestDefinitions;
			if (defs && defs.get) {
				testGetCreatedResource(swag, p, folder, path.key + "/{id}", defs.get)
			} else {
				console.warn('No getter for a concrete element specified ' + path.key + '/{id}')
			}
			if (path.value.get) {
				testGetAllResources(swag, p, folder, path.key, path.value.get);
			} else {
				console.warn('No getter for a full search specified ' + path.key);
			}
			p.folders.push(folder);		
		}
	}
}

function testGetCreatedResource(swag: Swagger, p: PostmanCollection, folder: Folder, path: string, requestDefinition: RequestDefinition) {
	const request = generateBasicRequest(p.id, folder.id, requestDefinition);
	request.url = '{{host}}{{path}}' + path.replace('{id}', '{{lastId}}');
	request.method = 'GET';
	request.tests += 'tests["Content-Type is present " + postman.getResponseHeader("Content-type")] = postman.getResponseHeader("Content-type");\n';
	request.tests += 'tests["Status code is 200"] = responseCode.code === 200;\n';
	request.tests += 'tests["POST Body Response equals Request Body"] = objectEquals(JSON.parse(postman.getGlobalVariable("lastRequest")), JSON.parse(responseBody));\n';
	request.tests += addObjectEquals();
	const responseContent = requestDefinition.responses['200'].schema || requestDefinition.responses['200'].content['application/json'].schema;
	const model = resolveModel(swag, responseContent);
	// check if the required attributes in the response object are all there
	if (model.required) {
		request.tests += 'tests["Response contains all required fields"] = findFieldsInBody(' + JSON.stringify(model.required) + ', JSON.parse(responseBody));\n';
		request.tests += addFindFieldsInBody();
	}
	folder.order.push(request.id);
	p.requests.push(request);
}

function testGetAllResources(swag: Swagger, p: PostmanCollection, folder: Folder, path: string, requestDefinition: RequestDefinition) {
	const request = generateBasicRequest(p.id, folder.id, requestDefinition);
	request.url = '{{host}}{{path}}' + path;
	request.method = 'GET';
	request.tests += 'tests["Content-Type is present " + postman.getResponseHeader("Content-type")] = postman.getResponseHeader("Content-type");\n';
	request.tests += 'tests["Status code is 200"] = responseCode.code === 200;\n';
	folder.order.push(request.id);
	p.requests.push(request);
}

function testCreateResource(swag: Swagger, p: PostmanCollection, folder: Folder, path: string, requestDefinition: RequestDefinition, example: any) {
	const request = generateBasicRequest(p.id, folder.id, requestDefinition);
	request.url = '{{host}}{{path}}' + path;
	request.method = 'POST';
	request.rawModeData = JSON.stringify(example);
	request.tests += 'tests["Content-Type is present " + postman.getResponseHeader("Content-type")] = postman.getResponseHeader("Content-type");\n';
	request.tests += 'tests["Status code is 201"] = responseCode.code === 201;\n';
	request.tests += 'tests["Response contains location header"] = responseHeaders.hasOwnProperty("Location");\n';
	request.tests += 'tests["Location header is correct"] = responseHeaders.hasOwnProperty("Location") &&\n';
	request.tests += '\t(postman.getResponseHeader("Location").toString() == environment["path"] + "' + path + '/" + JSON.parse(responseBody).id || //relative\n';
	request.tests += '\tpostman.getResponseHeader("Location").toString() == environment["host"] + environment["path"] + "' + path + '/" + JSON.parse(responseBody).id);   //absolute\n';
	// If there is no schema definition in the response, that stuff cannot be checked.
	if (requestDefinition.responses['201'].schema || (requestDefinition.responses['201'].content && requestDefinition.responses['201'].content['application/json'].schema)) {
		const responseContent = requestDefinition.responses['201'].schema || requestDefinition.responses['201'].content['application/json'].schema;
		const model = resolveModel(swag, responseContent);
		// check if the required attributes in the response object are all there
		if (model.required) {
			request.tests += 'tests["Response contains all required fields"] = findFieldsInBody(' + JSON.stringify(model.required) + ', JSON.parse(responseBody));\n';
			request.tests += addFindFieldsInBody();
		}
		request.tests += 'tests["POST Body Response equals Request Body"  ] = objectEquals(JSON.parse(request.data), JSON.parse(responseBody));\n';
		request.tests += addObjectEquals();
	}
	request.tests += 'postman.setGlobalVariable("lastId", JSON.parse(responseBody).id);\n';
	request.tests += 'postman.setGlobalVariable("lastRequest", request.data);\n';
	folder.order.push(request.id);
	p.requests.push(request);
}

function generatePostmanCollection(swag: Swagger): PostmanCollection {
	const p: PostmanCollection = {
		id: uuidv1(),
		name: swag.info.title,
		description: swag.info.description,
		order: new Array<string>(),
		folders: new Array<Folder>(),
		folders_order: new Array<string>(),
		timestamp: Date.now(),
		owner: owner,
		public: false,
		requests: new Array<Request>()
	};
	addTestsForSuccessfulMinimalCreation(swag, p);
	addTestsForMissingMandatoryParameters(swag, p);
	return p;
}

const {swagger, output} = processArgs();
const postmanCollection = generatePostmanCollection(swagger);
if (swagger) {
	if (output) {
		console.log('Writing to a file the following content');
		console.log(JSON.stringify(postmanCollection, null, 2));
	} else {
		console.log(JSON.stringify(postmanCollection, null, 2));
	}
}
