import {merge, Observable} from 'rxjs';
import {debounceTime, skip, take} from 'rxjs/operators';
import {OperatorResult} from '../types';

export function leadingDebounceTime<T>(d: number): OperatorResult<T> {
    return (source: Observable<T>): Observable<T> => {
        const firstValue = source.pipe(take(1));
        const nextValues = source.pipe(
            skip(1),
            debounceTime(d),
        );
        return merge(firstValue, nextValues);
    };
}
