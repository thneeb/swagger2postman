import { Folder } from './Folder';
import { Request } from './Request';

export interface PostmanCollection {
	id: string;
	name: string;
	description: string;
	order: string[];
	folders: Folder[];
	folders_order: string[];
	timestamp: number;
	owner: number;
	public: boolean;
	requests: Request[];
}