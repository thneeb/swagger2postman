import { RequestDefinition } from './RequestDefinition';

export interface RequestDefinitions {
    get?: RequestDefinition;
    post?: RequestDefinition;
    put?: RequestDefinition;
    patch?: RequestDefinition;
    delete?: RequestDefinition;
}