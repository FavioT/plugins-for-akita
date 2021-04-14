import {Observable, ObservedValueOf} from 'rxjs';
import {finalize} from 'rxjs/operators';
import {prepend} from './prepend';

/**
 * permite envolver un observable con una función que se ejecuta antes y otra que se ejecuta al finalizar
 */
export function wrap(before: () => {}, after: () => {}): <T>(source: Observable<T>) => Observable<ObservedValueOf<Observable<T>>> {
    return <T>(source: Observable<T>) => source.pipe(
        prepend(before),
        finalize(after)
    );
}

