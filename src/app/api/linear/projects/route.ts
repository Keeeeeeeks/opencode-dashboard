import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders, validateAuth } from '@/lib/auth/middleware';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const projects = db.getAllLinearProjects();
    const allIssues = db.getAllLinearIssues();

    const enrichedProjects = projects.map((project) => {
      const issues = allIssues.filter((issue) => issue.project_id === project.id);
      const issuesByState = issues.reduce(
        (acc, issue) => {
          const key = issue.state_type || 'unknown';
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      return {
        ...project,
        issues_by_state: issuesByState,
      };
    });

    return NextResponse.json({ projects: enrichedProjects }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching Linear projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Linear projects' },
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
