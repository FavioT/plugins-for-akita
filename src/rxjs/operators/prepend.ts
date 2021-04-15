import {defer, Observable, ObservedValueOf} from 'rxjs';

/**
 * Permite ejecutar una función antes del observable
 */
export function prepend(callback: () => {}): <T>(source: Observable<T>) => Observable<T> {
    return <T>(source: Observable<T>) => defer(() => {
        callback();
        return source;
    });
}
