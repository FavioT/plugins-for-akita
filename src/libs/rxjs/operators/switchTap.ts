import {from, MonoTypeOperatorFunction, Observable, ObservableInput, of} from 'rxjs';
import {finalize, switchMap} from 'rxjs/operators';

export function switchTap<T, R, O extends ObservableInput<any>>(
    project: (value: T, index: number) => O,
): MonoTypeOperatorFunction<T> {
    return (source$: Observable<T>) => {
        return source$.pipe(
            switchMap((prj: T, idx: number) => {
                const subscription = from(project(prj, idx)).subscribe();
                return new Observable<T>((observer) => {
                    observer.next(prj);
                }).pipe(
                    finalize(() => {
                        subscription.unsubscribe();
                    })
                );
            })
        );
    };
}
