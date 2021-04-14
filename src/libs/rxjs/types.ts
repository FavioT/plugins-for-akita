import {Observable} from 'rxjs';

export type OperatorResult<T> = (source: Observable<T>) => Observable<T>;
export type ReturnTypes<T extends Observable<any>[]> = { [P in keyof T]: T[P] extends Observable<infer R> ? R : never };
export type Observables = [Observable<any>] | Observable<any>[];

