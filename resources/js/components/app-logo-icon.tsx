import { PRODUCT_MARK } from '@/lib/brand';

export default function AppLogoIcon({ className }: { className?: string }) {
    return <img src={PRODUCT_MARK} alt="" width="64" height="64" className={className} />;
}
