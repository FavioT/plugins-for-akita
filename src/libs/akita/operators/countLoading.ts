import {Store} from '@datorama/akita';
import {Observable, ObservedValueOf} from 'rxjs';
import {wrap} from '../../rxjs/operators/wrap';

/**
 * Permite contar en un store cuantos observables pendientes hay, por ejemplo para contabilizar cuantas llamadas ajax hay pendientes
 */
export function countLoading(store: Store, loadingProperty: string = 'loading'):
    <T>(source: Observable<T>) => Observable<ObservedValueOf<Observable<T>>> {
    return <T>(source: Observable<T>) => source.pipe(
        wrap(
            () => store.update({[loadingProperty]: store.getValue()[loadingProperty] + 1}),
            () => store.update({[loadingProperty]: store.getValue()[loadingProperty] - 1})
        ),
    );
}

