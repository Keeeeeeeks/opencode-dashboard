import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders, validateAuth } from '@/lib/auth/middleware';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id') || undefined;

    const allIssues = projectId
      ? db.getLinearIssuesByProject(projectId)
      : db.getAllLinearIssues();

    const workflowStates = db.getAllLinearWorkflowStates();

    return NextResponse.json(
      { issues: allIssues, workflow_states: workflowStates },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch (error) {
    console.error('Error fetching Linear issues:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Linear issues' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
