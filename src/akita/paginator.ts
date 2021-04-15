import {
    AkitaPlugin,
    applyTransaction,
    EntityState,
    EntityStore,
    filterNilValue,
    getEntityStoreByName,
    ID,
    isArray,
    isNil,
    isNumber,
    isPlainObject,
    isUndefined,
    logAction,
    PaginationResponse,
    PaginatorConfig,
    QueryEntity,
    toEntitiesIds
} from '@datorama/akita';
import {delay, distinctUntilChanged, filter, map, mapTo, shareReplay, switchMap, take, tap} from 'rxjs/operators';
import {from, isObservable, Observable, of, Subscription} from 'rxjs';
import produce from 'immer';
import {getEntityType} from '@datorama/akita/lib/types';
import {HashedByIdEntities, HashedByStoreEntities} from './normalizedResult';
import {hasStoreName} from './hasStoreName';
import {iifOperator} from '../rxjs/operators/iifOperator';
import {leadingDebounceTime} from '../rxjs/operators/leadingDebounceTime';

type EntityNotFoundFn = (ids: ID[]) => void;

type PageRequestGetterFnResult<State> = NormalizedPaginationResponse<getEntityType<State>> | PaginationResponse<ID|getEntityType<State>>;
type PageRequestGetterWithoutParamsFn<State> = () => (Observable<PageRequestGetterFnResult<State>>);
type PageRequestGetterWithParamsFn<State> = ((page: number) => Observable<PageRequestGetterFnResult<State>>);
type PageRequestGetterFn<State> = PageRequestGetterWithoutParamsFn<State> | PageRequestGetterWithParamsFn<State>;


export type PaginatorStoreConfig = PaginatorConfig & {
    name?: string;
    entityNotFoundFn?: EntityNotFoundFn,
    placeholders: boolean
};

const paginatorDefaults: PaginatorStoreConfig = {
    pagesControls: false,
    range: false,
    startWith: 1,
    cacheTimeout: undefined,
    clearStoreWithCache: true,
    entityNotFoundFn: undefined,
    placeholders: true,
};

export class PaginatorPlaceholder<T = any> {
    constructor(public readonly id: ID) {}
}

export type PaginatorResponse<State> = PaginationResponse<State | PaginatorPlaceholder<State>>;

export function isPlaceholder(data: any): boolean {
    return data instanceof PaginatorPlaceholder;
}

const colors = ['red', 'green', 'blue', 'orange'];
let colorsIndex = 0;

export class PaginatorStorePlugin<State extends EntityState> extends AkitaPlugin<State> {
    config: PaginatorStoreConfig;
    metadata: PaginatorMetadata<State, PaginatorStateMetadata>;

    private readonly clearCacheSubscription?: Subscription;
    private readonly page: Observable<number>;
    private initial!: boolean;
    private lastGetPageCallTime?: Date;
    private readonly color: any;

    constructor(protected query: QueryEntity<State>, config?: PaginatorStoreConfig) {
        super(query);
        config = {...paginatorDefaults, ...config};
        if (!config.name) {
            config.name = makeNewName();
        }
        this.config = config;

        this.page = this.selectState('currentPage').pipe(
            shareReplay({ bufferSize: 1, refCount: true })
        );
        this.metadata = new PaginatorMetadata<State, PaginatorStateMetadata>(this);
        this.color = colors[colorsIndex++ % colors.length];

        const { cacheTimeout } = this.config;
        if (isObservable(cacheTimeout)) {
            this.clearCacheSubscription = cacheTimeout.subscribe(() => this.clearCache());
        }
    }

    isLoading$ = this.selectState().pipe(map(pagination => !this.hasPage(pagination.currentPage)),
        shareReplay({ bufferSize: 1, refCount: true })
    );

    get name(): string {
        return this.config.name ?? '';
    }

    get pageChanges(): Observable<number> {
        return this.page;
    }

    get isFirst(): boolean {
        return this.currentPage === 1;
    }

    get isLast(): boolean {
        return this.currentPage === this.pagination.lastPage;
    }

    withControls(): PaginatorStorePlugin<State> {
        this.config.pagesControls = true;
        return this;
    }

    withRange(): PaginatorStorePlugin<State> {
        this.config.range = true;
        return this;
    }

    setLoading(value = true): void {
        this.getStore().setLoading(value);
    }

    get currentPage(): number {
        return this.pagination.currentPage;
    }

    /**
     * Update the pagination object and add the page
     */
    update(response: PageRequestGetterFnResult<State>): void {
        // this.consoleLog('update');
//        applyTransaction(() => {
            this._setState(draft => {
                let paginatorData: PaginatedIDs | PaginationResponse<ID|getEntityType<State>>;
                if (isNormalizedPaginationResponse(response)) {
                    paginatorData = (response as NormalizedPaginationResponse<getEntityType<State>>).result;
                } else {
                    paginatorData = response;
                }

                draft.currentPage = paginatorData.currentPage;
                draft.perPage = paginatorData.perPage;
                draft.lastPage = paginatorData.lastPage;
                let total = paginatorData.total;
                if (total === undefined) {
                    if (paginatorData.lastPage === 1) {
                        total = paginatorData.data ? paginatorData.data.length : 0;
                    } else {
                        total = paginatorData.lastPage * paginatorData.perPage;
                    }
                }
                draft.total = total;
            });

            const entities = isNormalizedPaginationResponse(response) ? response :
                isEntitiesArray<getEntityType<State>>(response.data) ? response.data : null;
            if (entities) {
                this.addPage(entities);
            }
 //       });
    }

    /**
     *
     * Set the ids and add the page to store
     */
    addPage(data: getEntityType<State>[] | PageRequestGetterFnResult<State>): void {
        this.logAction(`Add Page (${this.currentPage})`);
        const {ids, entitiesArray, hashedByStoreEntities} = this.getEntitiesAndIds(data);

        this._setState(draft => {
            draft.pages[this.currentPage] = { ids };
        });

        // this.getStore().upsertMany(entitiesArray);
        // applyTransaction(() => {
        Object.keys(hashedByStoreEntities).forEach(storeName => {
            if (hasStoreName(storeName)) {
                const store = getEntityStoreByName<EntityStore<any>>(storeName);
                if (store) {
                    const hashedByIdEntities = hashedByStoreEntities[storeName];
                    const otherEntitiesArray = Object.values(hashedByIdEntities);
                    if (otherEntitiesArray.length) {
                        store.upsertMany(otherEntitiesArray);
                    }
                }
            }
        });
        // });
    }

    /**
     * Clear the cache.
     */
    clearCache(options: {clearStore?: boolean} = {}): void {
        if (!this.initial) {
            this.logAction('Clear Cache');
            if (options.clearStore !== false && (this.config.clearStoreWithCache || options.clearStore)) {
                this.getStore().remove();
            }
            this._makeStoreState(true);
        }
        this.initial = false;
    }

    clearPage(page: number): void {
        this._setState(draft => {
            delete draft.pages[page];
        });
    }

    clearPages(): void {
        this._setState(draft => {
            draft.pages = {};
        });
    }

    destroy({ clearCache, currentPage }: { clearCache?: boolean; currentPage?: number} = {}): void {
        if (this.clearCacheSubscription) {
            this.clearCacheSubscription.unsubscribe();
        }
        if (clearCache) {
            this.clearCache();
        }
        if (!isUndefined(currentPage)) {
            this.setPage(currentPage);
        }
        this.initial = true;
    }

    isPageActive(page: number): boolean {
        return this.currentPage === page;
    }

    setPage(page: number): void {
        if (this.pagination.currentPage !== page) {
            this.logAction(`Set Page (${page})`);
            this._setState(draft => { draft.currentPage = page; });
        }
    }

    nextPage(): void {
        if (this.currentPage !== this.pagination.lastPage) {
            this.setPage(this.pagination.currentPage + 1);
        }
    }

    prevPage(): void {
        if (this.pagination.currentPage > 1) {
            this.setPage(this.pagination.currentPage - 1);
        }
    }

    setLastPage(): void {
        this.setPage(this.pagination.lastPage);
    }

    setFirstPage(): void {
        this.setPage(1);
    }

    getPage(req: PageRequestGetterFn<State>):
        Observable<PaginatorResponse<getEntityType<State>>> {
        return this.getPage$(req, true);
    }

    getCurrentPage(req: PageRequestGetterFn<State>):
        Observable<PaginatorResponse<getEntityType<State>>> {
        return this.getPage$(req, false);
    }

    public selectPage(page: number, takeOne: boolean = false):
        Observable<PaginatorResponse<getEntityType<State>>> {

        return this.query.selectAll({asObject: true}).pipe(
            // tap(_ => this.consoleLog('query.selectAll({asObject:true})', Object.keys(_))),
            // iifOperator(takeOne, take(1)),
            filter(_ => !!this.getPageData(page)), // no emitir valores si no hay datos de la página buscada
            map(entities => {
                    const pagination = this.pagination;
                    const pageData = this.getPageData(page);
                    if (!pageData) { throw new Error(`page ${page} no tiene datos`); }
                    // this.consoleLog('pageData', pageData);
                    const entityNotFoundFn = this.config.entityNotFoundFn;
                    const unknownEntitiesIds: ID[] = [];
                    const response: PaginationResponse<getEntityType<State> | PaginatorPlaceholder<State>> = {
                        total: pagination.total,
                        currentPage: pagination.currentPage,
                        lastPage: pagination.lastPage,
                        perPage: pagination.perPage,
                        data: (!pageData || !pageData.ids) ? [] : pageData.ids.map(id => {
                            const entity = entities[id];
                            if (!entity) {
                                unknownEntitiesIds.push(id);
                            }
                            if (!entity && this.config.placeholders) {
                                return new PaginatorPlaceholder(id);
                            }
                            return entity;
                        }).filter(entity => !!entity)
                    };

                    if (entityNotFoundFn && unknownEntitiesIds.length > 0) {
                        // this.consoleLog('No se encontraron las entidades', unknownEntitiesIds);
                        setTimeout(() => entityNotFoundFn(unknownEntitiesIds), 10);
                    }

                    const { range, pagesControls } = this.config;
                    if (range) {
                        response.from = this.getFrom();
                        response.to = this.getTo();
                    }
                    if (pagesControls) {
                        response.pageControls = generatePages(this.pagination.total, this.pagination.perPage);
                    }
                    return response;
                },
            ));
    }

    getQuery(): QueryEntity<State> {
        return this.query as QueryEntity<State>;
    }

    refreshCurrentPage(): void {
        if (isNil(this.currentPage) === false) {
            this.clearPage(this.currentPage);
            this.setPage(this.currentPage);
        }
    }

    public selectControls(limit: number): Observable<number[]> {
        return this.selectState().pipe(
            map((paginator) => {
                const currentPage = paginator.currentPage;

                let fromPage = 1;
                let toPage = paginator.lastPage;
                if (limit < paginator.lastPage) {
                    const marginLeft = Math.floor(limit / 2);
                    const marginRight = limit - marginLeft - 1;
                    fromPage = currentPage - marginLeft;
                    toPage = currentPage + marginRight;
                    const leftOutbound = 1 - fromPage;
                    const rightOutbound = toPage - paginator.lastPage;
                    if (rightOutbound > 0) {
                        toPage = paginator.lastPage;
                        fromPage -= rightOutbound;
                    }
                    if (leftOutbound > 0) {
                        fromPage = 1;
                        toPage += leftOutbound;
                    }
                }

                const pageControls = [];
                for (let i = fromPage; i <= toPage; i++) {
                    pageControls.push(i);
                }
                return pageControls;
            }),
            // shareReplay({ bufferSize: 1, refCount: true })
        );
    }

    hasPage(page: number): boolean {
        return this.pagination?.pages.hasOwnProperty(page);
    }

    selectMetadata(): Observable<PaginatorState<getEntityType<State>>['metadata']> {
        return this.selectState('metadata').pipe(
            distinctUntilChanged(),
        );
    }

    getMetadata(): PaginatorState<getEntityType<State>>['metadata'] {
        return this.pagination.metadata;
    }

    public setMetadata(key: string, value: any): void {
        this._setState(draft => {
            draft.metadata[key] = value;
        }, 'Set Metadata');
    }

    selectState(): Observable<PaginatorState<getEntityType<State>>>;
    selectState<K extends keyof PaginatorState<getEntityType<State>>>(key: K): Observable<PaginatorState<getEntityType<State>>[K]>;
    selectState<K extends keyof PaginatorState<getEntityType<State>>>(key?: K):
    // Observable<typeof key extends undefined ? PaginatorState<getEntityType<State>> : PaginatorState<getEntityType<State>>[K]>
        Observable<PaginatorState<getEntityType<State>> | PaginatorState<getEntityType<State>>[K]>
    {
        return this.query.select((state: any) => {
            return state[this._storePaginatorStateKey];
        }).pipe(
            tap(storePaginator => {
                if (isNil(storePaginator)) {
                    this._makeStoreState();
                }
            }),
            filterNilValue(),
            map(storePaginator => key !== undefined ? storePaginator[key] : storePaginator),
            distinctUntilChanged()
        );
    }

    getStore(): EntityStore<State> {
        return super.getStore();
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    protected getPage$(req: PageRequestGetterFn<State>, takeOne: boolean):
        Observable<PaginatorResponse<getEntityType<State>>> {
        const delayMillisecond = 1000;

        return this.selectState('currentPage').pipe(
            iifOperator(takeOne, take(1)),
            leadingDebounceTime(0),
            switchMap(currentPage => {
                return this.selectState().pipe(
                    leadingDebounceTime(0),
                    filter(state => state.currentPage === currentPage),
                    switchMap(state => {
                        if (this.hasPage(currentPage)) {
                            return of(currentPage);
                        }
                        return of(delayMillisecond).pipe(
                            map(t => {
                                const now = new Date();
                                const elapsed = this.lastGetPageCallTime ? now.getTime() - this.lastGetPageCallTime.getTime() : null;
                                if (elapsed === null || elapsed > t) {
                                    t = 0;
                                }
                                return t;
                            }),
                            tap(_ => this.lastGetPageCallTime = new Date()),
                            switchMap(t => of(null).pipe(
                                // delay(t)
                                iifOperator(t > 0 , delay(t))
                            )),
                            switchMap(() => from(req(currentPage))),
                            // delay(0),
                            tap((paginatorData: PageRequestGetterFnResult<State>) => {
                                // setTimeout(() => {
                                applyTransaction(() => {
                                    this.update(paginatorData);
                                });
                                // }, 0);
                            }),
                            // delay(0),
                            mapTo(currentPage)
                        );
                    }),
                );
            }),
            switchMap(currentPage => {
                return this.selectPage(currentPage, false);
            })
        );
    }

    protected getEntitiesAndIds(data: unknown)
        : {ids: ID[], entitiesArray: getEntityType<State>[], hashedByStoreEntities: HashedByStoreEntities} {
        let ids: ID[] = [];
        let entitiesArray: getEntityType<State>[] = [];
        let hashedByStoreEntities: HashedByStoreEntities = {};
        const storeName = this.getStore().storeName;
        const idKey = this.getStore().idKey;
        if (isEntitiesArray(data)) {
            ids = toEntitiesIds<State>(data, idKey);
            entitiesArray = isEntitiesArray<getEntityType<State>>(data) ? data : [];
        } else if (isPaginationResponse<State>(data)) {
            entitiesArray = data.data;
            ids = toEntitiesIds<State>(data.data, idKey);
        } else if (isNormalizedPaginationResponse<State>(data)) {
            ids = data.result.data;
            if (data.entities && ids) {
                hashedByStoreEntities = data.entities;
                const storeEntities = data.entities[storeName];
                if (storeEntities) {
                    entitiesArray = ids.map(id => storeEntities[id.toString()]) as getEntityType<State>[];
                }
            }
        }

        return {
            ids,
            entitiesArray,
            hashedByStoreEntities
        };
    }

    private getFrom(): number {
        if (this.isFirst) {
            return 1;
        }
        return (this.currentPage - 1) * this.pagination.perPage + 1;
    }

    private getTo(): number {
        if (this.isLast) {
            return this.pagination.total;
        }
        return this.currentPage * this.pagination.perPage;
    }

        private getPageData(page: number): PageData|undefined {
        return this.pagination?.pages[page];
    }

    private get pagination(): PaginatorState<getEntityType<State>> {
        this._makeStoreState();
        return this.getStore().getValue()[this._storePaginatorStateKey];
    }

    private _setState(producer: ((draft: PaginatorState<getEntityType<State>>) => void), actionName?: string): void {
        this._makeStoreState();
        this.logAction(actionName ?? 'Update');
        return this.getStore().update((state: State) => {
            return produce(state, (draft: any ) => {
                producer(draft.hasOwnProperty(this._storePaginatorStateKey) ? draft[this._storePaginatorStateKey] : {});
            });
        });
    }

    private _makeStoreState(force = false): void {
        if (force || !this._hasPaginatorInStore()) {
            this.logAction('Set Initial State');
            const newState: {[key: string]: any} = {[this._storePaginatorStateKey]: initialPaginatorState<State>()};
            this.getStore().update((state: State) => {
                return produce(state, (draft: any) => {
                    Object.assign(draft, newState);
                });
            });
            // this.consoleLog('store created');
        }
    }

    private _hasPaginatorInStore(): boolean {
        return this.getStore().getValue().hasOwnProperty(this._storePaginatorStateKey);
    }

    private get _storePaginatorStateKey(): string {
        return this.name;
    }

    protected logAction(actionName: string, entityIds?: any, payload?: any): void {
        logAction(`@Paginator<${this.name}> ${actionName}`, entityIds, payload);
    }

    protected consoleLog(...args: any[]): void {
        console.log(`%c<${this.name}>`, `color: white; background-color:${this.color}`, ...args);
    }
}

////////////////////////////////////////
class PaginatorMetadata<State, MetadataState> {
    constructor(private paginator: PaginatorStorePlugin<State>) {
    }

    get(key: string): any {
        return this.paginator.getMetadata()?.[key];
    }

    select(key: string): any {
        return this.paginator.selectState('metadata').pipe(
            map(metadata => metadata[key]),
            distinctUntilChanged()
        );
    }

    set(key: string, value: any): void {
        this.paginator.setMetadata(key, value);
    }
}


export interface PaginatorStorePluginConfig {
    name: string;
}

type PaginatorStateMetadata = {[key: string]: any };

type PageData = { ids: ID[] };

type Pages = {[key: number]: PageData};

export interface PaginatorState<State> {
    perPage: number;
    lastPage: number;
    currentPage: number;
    total: number;
    pages: Pages;
    metadata: PaginatorStateMetadata;
}

let paginatorIndex = 1;
function makeNewName(): string {
    return 'paginator_' + paginatorIndex++;
}

function initialPaginatorState<T>(): PaginatorState<T> {
    return {
        perPage: 0,
        lastPage: 0,
        currentPage: 1,
        total: 0,
        pages: {},
        metadata: {}
    };
}

/**
 * Generate an array so we can ngFor them to navigate between pages
 */
function generatePages(total: number, perPage: number): number[] {
    const len = Math.ceil(total / perPage);
    const arr = [];
    for (let i = 0; i < len; i++) {
        arr.push(i + 1);
    }
    return arr;
}


export type PaginatedIDs = {
    currentPage: number;
    perPage: number;
    lastPage: number;
    total: number;
    data: ID[];
};

export interface NormalizedPaginationResponse<E> {
    result: PaginatedIDs;
    entities: HashedByStoreEntities;
}


function isID(id: any): id is ID {
    return isNumber(id) || id instanceof String;
}

function isHashedByIdEntities<E>(res: any): res is HashedByIdEntities<E> {
    return isPlainObject(res);
}

function isNormalizedPaginationResponse<S>(res: any): res is NormalizedPaginationResponse<S> {
    return !!res.result;
}

function isEntitiesArray<Entity>(res: any): res is getEntityType<Entity>[] {
    return isArray<Entity>(res) && (!res.length || isPlainObject(res[0]));
}

function isPaginationResponse<S>(res: any): res is PaginationResponse<getEntityType<S>> {
    return isPlainObject(res) && !!res.data;
}

function hasHashedByStoreEntities(res: any, name: string): res is HashedByStoreEntities {
    return isPlainObject(res) && res.hasOwnProperty(name);
}
