import {Observable, ObservedValueOf} from 'rxjs';
import {bufferWhen, debounceTime} from 'rxjs/operators';

export function bufferDebounceTime(time: number):
    <T>(source: Observable<T>) => Observable<ObservedValueOf<Observable<T[]>>> {
    return <T>(source: Observable<T>) => source.pipe(
        bufferWhen(() => source.pipe(debounceTime(time)))
    );
}

