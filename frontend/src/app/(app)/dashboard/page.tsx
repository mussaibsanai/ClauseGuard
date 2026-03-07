"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FileText, Upload, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { documentsApi } from "@/lib/api";

const statusConfig: Record<string, { icon: typeof Clock; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  uploaded: { icon: Clock, label: "Uploaded", variant: "secondary" },
  parsing: { icon: Clock, label: "Parsing", variant: "secondary" },
  redacting: { icon: AlertTriangle, label: "Redacting", variant: "outline" },
  analyzing: { icon: Clock, label: "Analyzing", variant: "outline" },
  done: { icon: CheckCircle, label: "Done", variant: "default" },
  error: { icon: XCircle, label: "Error", variant: "destructive" },
};

export default function DashboardPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data } = await documentsApi.list();
      return data;
    },
  });

  const documents = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground">
            {total} document{total !== 1 ? "s" : ""} uploaded
          </p>
        </div>
        <Button onClick={() => router.push("/upload")}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No documents yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Upload a PDF or DOCX contract to get started
            </p>
            <Button onClick={() => router.push("/upload")}>
              <Upload className="mr-2 h-4 w-4" />
              Upload your first document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc: any) => {
            const status = statusConfig[doc.status] || statusConfig.uploaded;
            const StatusIcon = status.icon;
            return (
              <Card
                key={doc.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => router.push(`/documents/${doc.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="truncate text-sm font-medium">
                      {doc.filename}
                    </CardTitle>
                    <Badge variant={status.variant} className="ml-2 shrink-0">
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {status.label}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {new Date(doc.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {doc.hipaaMode && (
                      <Badge variant="outline" className="text-xs">
                        HIPAA
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
