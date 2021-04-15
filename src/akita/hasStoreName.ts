import {__stores__, isNil} from '@datorama/akita';

export function hasStoreName(storeName: string): boolean {
    const store = __stores__[storeName];

    return !isNil(store);
}
