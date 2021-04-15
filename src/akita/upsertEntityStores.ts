import {applyTransaction, getEntityStoreByName} from '@datorama/akita';
import {hasStoreName} from './hasStoreName';
import {HashedByStoreEntities} from './normalizedResult';

export type HasHashedByStoreEntities = {
    entities: HashedByStoreEntities;
};

export function upsertEntityStores(res: HasHashedByStoreEntities | HashedByStoreEntities): void {
    applyTransaction(() => {
        const entities = isHasHashedByStoreEntities(res) ? res.entities: res;
        Object.keys(entities).forEach((storeName: string) => {
            if (hasStoreName(storeName)) {
                const store = getEntityStoreByName<any>(storeName);
                const storeEntitiesArray = Object.values(entities[storeName]);
                store.upsertMany(storeEntitiesArray);
            }
        });
    });
}

function isHasHashedByStoreEntities(test: HasHashedByStoreEntities | HashedByStoreEntities): test is HasHashedByStoreEntities {
    return test.hasOwnProperty('entities');
}
