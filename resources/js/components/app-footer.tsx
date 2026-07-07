// Site-wide footer shown on every screen (app, auth, and welcome).
export function AppFooter({ className = '' }: { className?: string }) {
    return (
        <footer className={`text-muted-foreground border-t px-6 py-3 text-center text-xs ${className}`}>
            Developed by Virtual Wisdom Technologies
        </footer>
    );
}
