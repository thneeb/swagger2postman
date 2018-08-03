import { Attribute } from './Attribute';

export interface Response {
	description?: string;
	schema?: Attribute;
	content?: any;
}