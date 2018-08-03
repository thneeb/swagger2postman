export interface Attribute {
	type?: string;
	format?: string;
	example?: any;
	title?: string;
	properties?: any;
	required?: string[];
	$ref?: string;
	allOf?: Attribute[];
	oneOf?: Attribute[];
	items?: Attribute;
}
