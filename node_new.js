const fs = require('fs');
const path = require('path');
const babelParser = require('@babel/parser');
const generate = require('@babel/generator').default;
const babelTraverse = require('@babel/traverse').default;
const t = require('@babel/types');

// 解析JavaScript代码为AST
function parseJavaScript(code) {
  return babelParser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
}

// 推断数组元素类型
function deduceElementType(elements) {
  if (!elements || elements.length === 0) {
    return 'any';
  }
  const elementTypes = new Set(elements.map(el => {
    if (el == null) return 'null';
    switch (el.type) {
      case 'NumericLiteral': return 'number';
      case 'StringLiteral': return 'string';
      case 'BooleanLiteral': return 'boolean';
      case 'NullLiteral': return 'null';
      case 'Identifier':
        if (el.name === 'undefined') return 'undefined';
        break;
      default: return 'any';
    }
  }));
  if (elementTypes.size === 1) {
    return Array.from(elementTypes)[0];
  }
  return 'any';
}

// 推断表达式类型
function deduceExpressionType(expression) {
  if (t.isNumericLiteral(expression)) {
    return t.tsNumberKeyword();
  } else if (t.isStringLiteral(expression)) {
    return t.tsStringKeyword();
  } else if (t.isBooleanLiteral(expression)) {
    return t.tsBooleanKeyword();
  } else if (t.isNullLiteral(expression)) {
    return t.tsNullKeyword();
  } else if (t.isIdentifier(expression) && expression.name === 'undefined') {
    return t.tsUndefinedKeyword();
  } else if (t.isArrayExpression(expression)) {
    const elementType = deduceElementType(expression.elements);
    return t.tsArrayType(t.tsTypeReference(t.identifier(elementType)));
  }
  return t.tsAnyKeyword(); // 如果无法推断出类型则返回any
}

// 添加类型注解到AST
function addTypeAnnotations(ast) {
  babelTraverse(ast, {
    VariableDeclarator(path) {
      if (path.node.init) {
        const inferredType = deduceExpressionType(path.node.init);
        path.node.id.typeAnnotation = t.tsTypeAnnotation(inferredType);
      } else {
        path.node.id.typeAnnotation = t.tsTypeAnnotation(t.tsAnyKeyword());
      }
    },
    FunctionDeclaration(path) {
      path.node.params.forEach(param => {
        param.typeAnnotation = t.tsTypeAnnotation(t.tsAnyKeyword());
      });
      if (path.node.returnType == null) {
        let returnType = t.tsVoidKeyword();
        if (path.node.body.body && path.node.body.body.length > 0) {
          path.node.body.body.forEach(statement => {
            if (t.isReturnStatement(statement) && statement.argument != null) {
              returnType = deduceExpressionType(statement.argument);
            }
          });
        }
        path.node.returnType = t.tsTypeAnnotation(returnType);
      }
    },
    ArrowFunctionExpression(path) {
      path.node.params.forEach(param => {
        param.typeAnnotation = t.tsTypeAnnotation(t.tsAnyKeyword());
      });
      if (path.node.returnType == null) {
        let returnType = t.tsVoidKeyword();
        if (path.node.body && t.isBlockStatement(path.node.body)) {
          path.node.body.body.forEach(statement => {
            if (t.isReturnStatement(statement) && statement.argument != null) {
              returnType = deduceExpressionType(statement.argument);
            }
          });
        } else if (path.node.body) {
          returnType = deduceExpressionType(path.node.body);
        }
        path.node.returnType = t.tsTypeAnnotation(returnType);
      }
    }
  });
}

// 生成TypeScript代码
function generateTypeScript(ast) {
  const output = generate(ast, {}, '');
  return output.code;
}

// 主函数：转换JavaScript文件为TypeScript文件
function transformJsFileToTsFile(jsFilePath) {
  const jsCode = fs.readFileSync(jsFilePath, 'utf8');
  const ast = parseJavaScript(jsCode);
  addTypeAnnotations(ast);
  const tsCode = generateTypeScript(ast);
  const tsFilePath = jsFilePath.replace('.js', '.ts');
  fs.writeFileSync(tsFilePath, tsCode);
  console.log(`转换成功：${jsFilePath} => ${tsFilePath}`);
}

// 转换指定目录下的所有JavaScript文件
function transformJsFilesInDir(dirPath) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isFile() && filePath.endsWith('.js')) {
      transformJsFileToTsFile(filePath);
    }
  });
}

// 示例：转换指定目录下的所有JavaScript文件
const jsDirPath = '文件路径';
transformJsFilesInDir(jsDirPath);
