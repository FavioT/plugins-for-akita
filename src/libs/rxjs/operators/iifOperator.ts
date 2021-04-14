import {MonoTypeOperatorFunction, Observable} from 'rxjs';

export function iifOperator<T>(isTrue: boolean, trueOperator?: MonoTypeOperatorFunction<T>, falseOperator?: MonoTypeOperatorFunction<T>):
    MonoTypeOperatorFunction<T> {
    return (source$: Observable<T>) => {
        if (isTrue && trueOperator) {
            return source$.pipe(trueOperator);
        } else if (!isTrue && falseOperator) {
            return source$.pipe(falseOperator);
        }
        return source$;
    };
}
