import { Parameter } from './Parameter';
import { Responses } from './Responses';

export interface RequestDefinition {
	summary?: string;
	description?: string;
	operationId?: string;
	consumes?: string[];
	produces?: string[];
	parameters?: Parameter[];
	responses: Responses;
	requestBody?: any;
}