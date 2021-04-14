import {applyTransaction, EntityAction, EntityActions, EntityState, EntityStore, getIDType, ID, logAction, Store} from '@datorama/akita';
import {untilDestroyed} from '@ngneat/until-destroy';
import produce from 'immer';
import {HashedByIdEntities} from './normalizedResult';
import {getEntityType} from '@datorama/akita/lib/types';

export type IdxState<S> = {
    ids: {
        [index: string]: string,
    },
    idx: {
        [index: string]: getIDType<S> | undefined
    }
};

function createInitialState<S>(): IdxState<S> {
    return {
        ids: {},
        idx: {}
    };
}

export function getIndexedStoreName(store: Store, idx: string): string {
    return 'IDX/' + store.storeName + '/' + idx;
}

export class IdxEntityStore<S extends EntityState> extends Store<IdxState<S>>{
    constructor(private entityStore: EntityStore<S>, protected idx: string) {
        super(createInitialState(),
            { name: getIndexedStoreName(entityStore, idx ), resettable: entityStore.resettable });
        this.subscribeToActions();
    }

    public getId(idx: string): getIDType<S> | undefined {
        return this.getValue().idx[idx];
    }

    public getIdx(id: ID): string {
        return this.getValue().ids[id];
    }

    protected subscribeToActions(): void {
        this.entityStore.selectEntityAction$.pipe(
            untilDestroyed(this, 'destroy')
        ).subscribe((action: EntityAction<getIDType<S>>) => {
            if (action.type === EntityActions.Remove) {
                this.removeEntities(action.ids);
            } else {
                this.updateEntities(action.ids);
            }
        });
    }

    protected removeEntities(ids: getIDType<S>[]): void {
        applyTransaction(() => {
            logAction('Remove Indexes');
            ids.forEach(id => {
                this.removeIndex(id);
            });
        });
    }

    protected updateEntities(ids: getIDType<S>[]): void {
        applyTransaction(() => {
            logAction('Update Indexes');
            ids.forEach(id => {
                this.upsertIndex(id);
            });
        });
    }

    protected upsertIndex(id: getIDType<S>): void {
        const entityIdx = this.getEntityIdx(id);
        if (entityIdx) {
            this.update(produce(this.getValue(), (draft: IdxState<S>) => {
                draft.ids[String(id)] = entityIdx;
                draft.idx[String(entityIdx)] = id;
            }));
        }
    }

    protected removeIndex(id: getIDType<S>): void {
        const state = this.getValue();
        if (state) {
            const idx = state.ids[String(id)];
            if (idx) {
                this.update(produce(state, (draft: IdxState<S>) => {
                    delete draft.ids[String(id)];
                    delete draft.idx[String(idx)];
                }));
            }
        }
    }

    protected get entities(): HashedByIdEntities | undefined {
        return this.entityStore.getValue().entities;
    }

    protected hasEntity(id: ID): boolean {
        return !!this.entities?.hasOwnProperty(id);
    }

    protected getEntity(id: ID): getEntityType<S> | undefined {
        return this.entities && this.hasEntity(id) ? (this.entities[id] as getEntityType<S>) : undefined;
    }

    protected getEntityIdx(id: ID): string | undefined {
        const entity = this.getEntity(id);
        return entity?.[this.idx];
    }
}


/**
 * decorator @IndexedBy
 */
// export function IndexedBy(idx: string): (c: AConstructorTypeOf<Store>) => void {
//     return (constructor: AConstructorTypeOf<Store>) => {
//         const constructorKey = `__index_by_${idx}__`;
//         if (!constructor.prototype[constructorKey]) {
//             constructor.prototype[constructorKey] = true;
//             const onInit = constructor.prototype.onInit;
//             constructor.prototype.onInit = (...args: any[]): void => {
//
//                 onInit.call(self, args);
//             };
//         }
//     };
// }
