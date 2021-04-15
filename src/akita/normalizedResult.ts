import {ID} from '@datorama/akita';

export type HashedByStoreEntities = {
    [index: string]: HashedByIdEntities;
};

export type HashedByIdEntities<E = object> = {
    [index: string]: E;
};

export type NormalizedResult<R = any> = {
    result: R,
    entities: HashedByStoreEntities;
};

export type NormalizedIDsResult = NormalizedResult<ID[]>;

