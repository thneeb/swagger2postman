import { HeaderData } from './HeaderData';
import { QueryParam } from './QueryParam';

export interface Request {
	id: string;
	name: string;
	description: string;
	headers: string;
	headerData: HeaderData[];
	url: string;
	queryParams: QueryParam[];
	preRequestScript: string;
	method: string;
	data: string[];
	dataMode: string;
	version: number;
	tests: string;
	currentHelper: string;
	time: number;
	collectionId: string;
	rawModeData: string;
}