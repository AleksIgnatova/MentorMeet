/** Shape of every successful JSON response body. Errors use `{ error: { … } }`. */
export type DataResponse<T> = { data: T };

export const dataResponse = <T>(data: T): DataResponse<T> => ({ data });
