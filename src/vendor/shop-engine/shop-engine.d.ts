export interface ShopProduct {
    id: string;
    title: string;
    priceRub: number;
}
export interface LoyaltyLevel {
    id: string;
    title: string;
    /** С какой суммы покупок за всё время, ₽. */
    fromRub: number;
    /** Сколько процентов от оплаченного деньгами возвращается баллами. */
    percent: number;
}
export interface LoyaltyProgram {
    /** Баллов за регистрацию в кабинете. */
    signupBonus: number;
    /** Какую долю заказа можно оплатить баллами, %. */
    maxRedeemPercent: number;
    levels: LoyaltyLevel[];
    /** Сколько дней заказ ждёт оплату, потом отменяется сам (1–7). */
    paymentDays: number;
    /** Через сколько дней после доставки баллы за заказ становятся доступны. */
    returnDays: number;
}
export interface Line {
    productId: string;
    qty: number;
}
export interface Profile {
    email: string;
    name: string;
    phone: string;
    birthday: string;
    newsConsent: boolean;
}
export interface HistoryRow {
    at: string;
    /** Плюс – пришли, минус – ушли; 0 – смена состояния (например, «стали доступны»). */
    points: number;
    text: string;
    orderId: string | null;
}
export interface OrderView {
    id: string;
    /** Номер заказа на сайте (то, что видит флорист). */
    externalNum: string | null;
    placedAt: string;
    status: string;
    statusTitle: string;
    totalRub: number;
    pointsSpent: number;
    pointsEarn: number;
    lines: {
        title: string;
        qty: number;
        amountRub: number;
    }[];
    canCancel: boolean;
    /** Что можно сделать демо-кнопками (в пути Б – действия магазина). */
    demo: {
        canMarkPaid: boolean;
        canMarkDelivered: boolean;
        canPassDay: boolean;
    };
}
export interface Account {
    profile: Profile;
    balance: {
        available: number;
        pending: number;
        held: number;
    };
    level: {
        title: string;
        percent: number;
    };
    next: {
        title: string;
        percent: number;
        leftRub: number;
    } | null;
    spentRub: number;
    levels: LoyaltyLevel[];
    history: HistoryRow[];
    orders: OrderView[];
}
export interface QuoteView {
    subtotalRub: number;
    /** Сколько баллов можно списать в этом заказе. */
    maxPoints: number;
    pointsUsed: number;
    payRub: number;
    earn: number;
    percent: number;
}
export interface ShopApi {
    requestCode(email: string): Promise<{
        demoCode?: string;
    }>;
    /**
     * consent – согласия при первом входе (регистрация на сервере требует согласия на обработку ПДн; демо – не нужно).
     * Галочка не стоит – consent не передаётся (не { pdn: false }): вошедший раньше войдёт и без неё.
     */
    verify(email: string, code: string, consent?: {
        pdn: true;
        marketing?: boolean;
    }): Promise<void>;
    logout(): Promise<void>;
    /** Кто вошёл – лёгкий запрос для шапки; null – гость. */
    me(): Promise<{
        email: string;
        name: string;
    } | null>;
    /** null – не вошёл. */
    account(): Promise<Account | null>;
    /** Процент кешбэка вошедшего, для гостя – первого уровня. */
    rate(): Promise<number>;
    /**
     * null – не вошёл или корзина пуста (после отбрасывания товаров, которых нет в каталоге). Только чтение – на копии
     * данных в памяти: ни записей, ни событий (иначе острова, пересчитывающие корзину по subscribe, зациклились бы, в том
     * числе две вкладки с разным выбором баллов). Больше 99 штук одного товара – ошибка.
     */
    /** points – сколько баллов списать (целое ≥ 0); без него при usePoints – максимум. Больше доступного и доли списания не спишется. Путь Б пока его не знает – там «всё или ничего». */
    quote(input: {
        lines: Line[];
        usePoints: boolean;
        points?: number;
    }): Promise<QuoteView | null>;
    placeOrder(input: {
        lines: Line[];
        usePoints: boolean;
        points?: number;
        meta: {
            externalNum: string;
        };
    }): Promise<{
        orderId: string;
        pointsUsed: number;
        earn: number;
        payRub: number;
    }>;
    cancelOrder(orderId: string): Promise<void>;
    updateProfile(patch: Partial<Omit<Profile, "email">>): Promise<void>;
    /** Изменения в этой вкладке (демо – и в соседних: общее хранилище); возвращает отписку. */
    subscribe(fn: () => void): () => void;
    /** Только путь А: то, что в бою делает магазин. */
    demo?: {
        markPaid(orderId: string): Promise<void>;
        markDelivered(orderId: string): Promise<void>;
        passDays(days: number): Promise<void>;
    };
}
export interface DemoShopInput {
    products: ShopProduct[];
    program: LoyaltyProgram;
    /** Префикс ключей localStorage – свой, не пересекается с ключами сайта (сброс стирает всё по префиксу). */
    storagePrefix: string;
    /** Для тестов: своё хранилище, случайные байты и часы. */
    kv?: {
        get(key: string): string | null;
        set(key: string, value: string): void;
        remove(key: string): void;
        keys(): string[];
    };
    random?: (n: number) => Uint8Array;
    now?: () => Date;
}
export declare function createDemoShop(input: DemoShopInput): ShopApi;
export declare class ShopApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
/** `base` – адрес API без хвоста ("" – тот же хост, что сайт). `fetchImpl` – для тестов. */
export declare function createApiShop(base?: string, fetchImpl?: typeof fetch): ShopApi;
