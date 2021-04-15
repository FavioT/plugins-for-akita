import {EntityState, getIDType, ID, Query, QueryEntity} from '@datorama/akita';
import {IdxState, IdxEntityStore} from './idxEntityStore';
import {Observable, of} from 'rxjs';
import {getEntityType} from '@datorama/akita/lib/types';
import {distinctUntilChanged, switchMap} from 'rxjs/operators';

export type IDX = string;

export class IdxEntityQuery<S extends EntityState, EntityType = getEntityType<S>, IDType = getIDType<S>>
    extends Query<IdxState<S>>{
    constructor(protected indexedEntityStore: IdxEntityStore<S>, protected queryEntity: QueryEntity<S>) {
        super(indexedEntityStore);
    }

    hasEntity(idx: string): boolean {
        const id = this.getId(idx);
        return id ? this.queryEntity.hasEntity(id as getIDType<S>) : false;
    }

    getEntity(idx: IDX): getEntityType<S> | undefined {
        const id = this.getId(idx);
        return id !== undefined ? this.queryEntity.getEntity(id as getIDType<S>) : undefined;
    }

    selectEntity(idx: string): Observable<EntityType | undefined> {
        return this.selectId(idx).pipe(
            switchMap((id: IDType | undefined) => {
                return id !== undefined ? this.queryEntity.selectEntity(id as getIDType<S>) : of(undefined);
            }),
            // distinctUntilChanged()
        );
    }

    getId(idx: string): IDType | undefined {
        return super.getValue().idx[idx];
    }

    selectId(idx: string): Observable<IDType | undefined> {
        return super.select(state => state.idx[idx]);
    }

    getIdx(id: ID): string | unknown {
        return super.getValue().ids[id];
    }

    selectIdx(id: ID): Observable<string | unknown> {
        return super.select(state => state.ids[id]);
    }
}
