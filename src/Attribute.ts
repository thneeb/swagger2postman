export interface Attribute {
	type?: string;
	format?: string;
	example?: any;
	title?: string;
	properties?: any;
	required?: string[];
	readOnly?: boolean;
	$ref?: string;
	allOf?: Attribute[];
	oneOf?: Attribute[];
	discriminator? : {
		propertyName: string,
		mapping?: object
	};
	items?: Attribute;
}
