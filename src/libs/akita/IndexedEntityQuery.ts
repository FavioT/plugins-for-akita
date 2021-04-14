import {EntityState, ID, QueryEntity} from '@datorama/akita';
import {IndexedEntityStore} from './indexedEntityStore';
import {IDX, IdxEntityQuery} from './idxEntityQuery';
import {getEntityType} from '@datorama/akita/lib/types';
import {Observable} from 'rxjs';

export class IndexedEntityQuery<S extends EntityState, I extends string>
    extends QueryEntity<S> {
    protected idxQueries: {[key: string]: IdxEntityQuery<S>} = {};

    constructor(store: IndexedEntityStore<S, I>) {
        super(store);
        this.createIdxQueries();
    }

    public selectEntityBy(idx: I, value: IDX): Observable<getEntityType<S> | undefined> {
        return this.getIndexQuery(idx).selectEntity(value);
    }

    public getIndexQuery(idx: I): IdxEntityQuery<S> {
        if (!this.idxQueries[idx]) {
            throw new Error(`No existe una IdxEntityQuery para el indice ${idx}`);
        }
        return this.idxQueries[idx];
    }

    protected createIdxQueries(): void {
        const indexes = (this.__store__ as IndexedEntityStore<S, I>).indexes;
        if (indexes) {
            indexes.forEach(index => {
                this.createIdxQuery(index);
            });
        }
    }

    protected createIdxQuery(idx: I): void {
        const store = (this.__store__ as IndexedEntityStore<S, I>).getIndexStore(idx);
        if (store) {
            this.idxQueries[idx] = new IdxEntityQuery(store, this);
            type FN = (idx: IDX) => Observable<getEntityType<S> | undefined>;
            (this as any)[`selectEntityBy${idx.toUpperCase()}`] = this.selectEntityBy.bind(this, idx) as FN;
        }
    }
}

// export type SelectEntityBy<I, S> = {
//     [key in I as `selectEntityBy${Capitalize<string & key>}`]: (idx: I) => Observable<getEntityType<S> | undefined>;
// };
