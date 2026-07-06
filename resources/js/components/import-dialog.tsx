import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { router } from '@inertiajs/react';
import { FileDown, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    importUrl: string;
    templateUrl: string;
}

export function ImportDialog({ open, onOpenChange, title, importUrl, templateUrl }: Props) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const submit = () => {
        const file = fileInput.current?.files?.[0];
        if (!file || uploading) return;
        setUploading(true);
        router.post(importUrl, { file }, {
            forceFormData: true,
            preserveScroll: true,
            onFinish: () => {
                setUploading(false);
                onOpenChange(false);
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                    <p className="text-sm text-muted-foreground">
                        Upload an .xlsx/.csv file using the template columns. Existing records
                        (matched by name) are updated; new ones are created. Rows with errors
                        are skipped and reported.
                    </p>
                    <Button variant="outline" size="sm" asChild className="w-fit">
                        <a href={templateUrl}>
                            <FileDown className="mr-1 size-4" /> Download Template
                        </a>
                    </Button>
                    <div>
                        <Label htmlFor="import-file">File</Label>
                        <Input id="import-file" ref={fileInput} type="file" accept=".xlsx,.xls,.csv" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} disabled={uploading}>
                        <Upload className="mr-1 size-4" /> {uploading ? 'Importing…' : 'Import'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
