import {EntityState, EntityStore, getInitialEntitiesState, Store, StoreConfigOptions} from '@datorama/akita';
import {IdxEntityStore} from './idxEntityStore';
import {Constructor, isTransferStateStore, TransferStateStore} from '../../services/transfer-state-store.service';

export type IndexedStoreConfigOptions<I = string> = StoreConfigOptions & {
    idx?: I[]
};

export class IndexedEntityStore<S extends EntityState, I extends string>
    extends EntityStore<S> {
    idxEntityStores: {[key: string]: IdxEntityStore<S>} = {};

    constructor(initialState: Partial<S> = {}, protected options: Partial<IndexedStoreConfigOptions<I>> = {}) {
        super({ ...getInitialEntitiesState(), ...initialState }, options);
        this.createIdxEntityStores();
    }

    public getIndexStore(idx: I): IdxEntityStore<S>{
        if (!this.idxEntityStores[idx]) {
            throw new Error(`El store ${this.storeName} no tiene un IdxEntityStore para el indice ${idx}`);
        }
        return this.idxEntityStores[idx];
    }

    public get indexes(): IndexedStoreConfigOptions<I>['idx'] {
        return this.getConfig('idx') as IndexedStoreConfigOptions<I>['idx'];
    }

    protected getConfig(value: string): any {
        return (this.config as any)[value] || (this.options as any)[value];
    }

    protected createIdxEntityStores(): void {
        const idx = this.indexes;
        if (idx) {
            idx.forEach(idxName => this.createIdxEntityStore(idxName));
        }
    }

    protected createIdxEntityStore(idx: string): void {
        const NewIdxEntityStoreClass = class extends IdxEntityStore<S> {};
        if (isTransferStateStore(this.constructor as Constructor<Store>)) {
            TransferStateStore(NewIdxEntityStoreClass);
        }

        this.idxEntityStores[idx] = (new NewIdxEntityStoreClass(this, idx));
    }
}
