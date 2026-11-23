import { Head, useForm } from '@inertiajs/react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { type FormEventHandler, useEffect, useState } from 'react';

import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { clearWorkspaceTabs } from '@/hooks/use-tabs';
import AuthLayout from '@/layouts/auth-layout';

type LoginForm = {
    email: string;
    password: string;
};

interface LoginProps {
    status?: string;
}

const inputClass = 'h-12 w-full rounded-xl border border-input bg-background pl-10 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none aria-invalid:border-destructive sm:text-sm';
const fieldIconClass = 'pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground';

export default function Login({ status }: LoginProps) {
    useEffect(clearWorkspaceTabs, []);
    const [showPassword, setShowPassword] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm<LoginForm>({
        email: '',
        password: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('login'), {
            onFinish: () => {
                reset('password');
                setShowPassword(false);
            },
        });
    };

    return (
        <AuthLayout title="Log in" description="Enter your email and password to open your workspace.">
            <Head title="Log in" />

            {status && (
                <p role="status" className="mb-5 rounded-xl border border-teal-700/20 bg-teal-50 px-3 py-2.5 text-sm text-teal-900 dark:bg-teal-900/30 dark:text-teal-100">
                    {status}
                </p>
            )}

            <form className="grid gap-5" onSubmit={submit} aria-busy={processing}>
                <div className="grid gap-2">
                    <Label htmlFor="email">Email address</Label>
                    <div className="relative">
                        <Mail aria-hidden="true" className={fieldIconClass} />
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            autoFocus
                            autoComplete="username"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            placeholder="you@company.com"
                            className={`${inputClass} pr-3`}
                            aria-invalid={Boolean(errors.email)}
                            aria-describedby={errors.email ? 'login-email-error' : undefined}
                        />
                    </div>
                    <InputError id="login-email-error" role="alert" message={errors.email} />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                        <LockKeyhole aria-hidden="true" className={fieldIconClass} />
                        <input
                            id="password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            placeholder="Enter password"
                            className={`${inputClass} pr-12`}
                            aria-invalid={Boolean(errors.password)}
                            aria-describedby={errors.password ? 'login-password-error' : undefined}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            aria-controls="password"
                            onClick={() => setShowPassword((visible) => !visible)}
                            className="absolute top-0.5 right-0.5 size-11 rounded-lg text-muted-foreground"
                        >
                            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                        </Button>
                    </div>
                    <InputError id="login-password-error" role="alert" message={errors.password} />
                </div>

                <Button type="submit" disabled={processing} className="h-12 w-full rounded-xl font-semibold">
                    Log in
                    {processing ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ArrowRight aria-hidden="true" />}
                </Button>
            </form>
        </AuthLayout>
    );
}
