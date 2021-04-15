import {combineLatest, Observable} from 'rxjs';
import {leadingDebounceTime} from './leadingDebounceTime';
import {Observables, ReturnTypes} from '../types';

export function leadingCombineQueries<R extends Observables>(observables: R): Observable<ReturnTypes<R>> {
    return combineLatest(observables).pipe(leadingDebounceTime(0)) as any;
}
