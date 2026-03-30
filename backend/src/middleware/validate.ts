import { ZodType } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      console.error('[validate] FAILED', req.method, req.path, JSON.stringify({ body: req.body, fieldErrors }));
      return res.status(400).json({
        error: 'Validation failed',
        details: fieldErrors
      });
    }
    req.body = result.data;
    next();
  };
}
