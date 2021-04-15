import {combineLatest, Observable} from 'rxjs';
import {throttleTime} from 'rxjs/operators';

export function combineQueriesThrottle(observables: Observable<unknown>[]): Observable<unknown[]> {
    return combineLatest(observables).pipe(throttleTime(0));
}
