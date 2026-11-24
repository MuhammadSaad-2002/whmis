import { HrLayout } from './shared';
export default function Unlinked() {
    return <HrLayout title="My HR" description="Your leave, attendance, and payslips">
        <section className="card register-panel">
            <h2>Employee profile not linked yet</h2>
            <p className="muted mt-2">Ask HR to link your existing login to your employee record. Your leave history and payslips will appear here.</p>
        </section>
    </HrLayout>;
}
