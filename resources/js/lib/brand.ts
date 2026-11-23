function readMeta(name: string): string | undefined {
    return typeof document === 'undefined' ? undefined : document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
}

export const PRODUCT_NAME = readMeta('application-name') || 'Tradentra';
export const PRODUCT_TAGLINE = readMeta('description') || 'The Complete Business Management Platform';
export const PRODUCT_MARK = '/branding/tradentra-mark.svg';
