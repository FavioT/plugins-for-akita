import {interval, Observable, zip} from 'rxjs';
import {map} from 'rxjs/operators';
import {OperatorResult} from '../types';

export function spreadBy<T>(d: number): OperatorResult<T> {
    return (source: Observable<T>): Observable<T> => {
        return zip(source, interval(d)).pipe(
            map(([val, _]) => val)
        );
    };
}
