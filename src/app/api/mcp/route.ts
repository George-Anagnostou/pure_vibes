// /api/mcp is a common typo for the MCP endpoint. Answer MCP clients with a
// pointer to the real one instead of the HTML 404 page.
function wrongPath(request: Request) {
  const endpoint = new URL("/api/mcp/mcp", request.url).toString();
  return Response.json(
    {
      error: "not_found",
      error_description: `The Glass Box MCP endpoint is ${endpoint}`,
    },
    { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
  );
}

export { wrongPath as GET, wrongPath as POST };
