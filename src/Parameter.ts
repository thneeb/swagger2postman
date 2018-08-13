import { Attribute } from './Attribute';

export interface Parameter {
	in: string;
	name: string;
	description: string;
	required: boolean;
	schema: Attribute;
}