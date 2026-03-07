"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileText, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { documentsApi } from "@/lib/api";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [hipaaMode, setHipaaMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const validateFile = useCallback((f: File): boolean => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      toast.error("Only PDF and DOCX files are accepted");
      return false;
    }
    if (f.size > MAX_SIZE) {
      toast.error("File must be under 20MB");
      return false;
    }
    return true;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f && validateFile(f)) setFile(f);
    },
    [validateFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && validateFile(f)) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);
    setStatus("Uploading...");

    try {
      const { data } = await documentsApi.upload(file, hipaaMode);
      setProgress(30);
      setStatus("Processing...");

      // Connect to SSE for progress updates
      const es = documentsApi.statusStream(data.id);
      es.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        setStatus(payload.message || payload.status);

        switch (payload.status) {
          case "parsing":
            setProgress(50);
            break;
          case "redacting":
            setProgress(65);
            break;
          case "analyzing":
            setProgress(80);
            break;
          case "done":
            setProgress(100);
            es.close();
            toast.success("Document processed successfully");
            setTimeout(() => router.push("/dashboard"), 1000);
            break;
          case "error":
            es.close();
            toast.error(payload.message || "Processing failed");
            setUploading(false);
            break;
        }
      };

      es.onerror = () => {
        es.close();
        // SSE might close normally after done, only show error if still uploading
        if (progress < 100) {
          setStatus("Processing in background...");
          toast.info("Connection lost. Document is still processing.");
          setTimeout(() => router.push("/dashboard"), 2000);
        }
      };
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Upload failed");
      setUploading(false);
      setProgress(0);
      setStatus(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Document</h1>
        <p className="text-muted-foreground">
          Upload a PDF or DOCX contract for analysis
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select File</CardTitle>
          <CardDescription>
            Supports PDF and DOCX files up to 20MB
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Drop zone */}
          <div
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : file
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx"
              onChange={handleFileChange}
            />
            {file ? (
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-green-500" />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatSize(file.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Drop your contract here</p>
                <p className="text-sm text-muted-foreground">
                  or click to browse
                </p>
              </>
            )}
          </div>

          {/* HIPAA toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <Label className="font-medium">HIPAA Redaction Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically redact PII before AI processing
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hipaaMode}
              onClick={() => setHipaaMode(!hipaaMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                hipaaMode ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  hipaaMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {hipaaMode && (
            <Badge variant="outline" className="w-full justify-center py-2">
              <Shield className="mr-2 h-3.5 w-3.5" />
              HIPAA mode enabled - PII will be redacted before AI analysis
            </Badge>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-center text-sm text-muted-foreground">
                {status}
              </p>
            </div>
          )}

          {/* Submit */}
          <Button
            className="w-full"
            size="lg"
            disabled={!file || uploading}
            onClick={handleUpload}
          >
            {uploading ? (
              status || "Processing..."
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload & Analyze
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
