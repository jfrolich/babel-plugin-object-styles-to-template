/* @flow */

const dashify = text => text.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
const unitless = {
  animationIterationCount: true,
  borderImageOutset: true,
  borderImageSlice: true,
  borderImageWidth: true,
  boxFlex: true,
  boxFlexGroup: true,
  boxOrdinalGroup: true,
  columnCount: true,
  columns: true,
  flex: true,
  flexGrow: true,
  flexPositive: true,
  flexShrink: true,
  flexNegative: true,
  flexOrder: true,
  gridRow: true,
  gridRowEnd: true,
  gridRowSpan: true,
  gridRowStart: true,
  gridColumn: true,
  gridColumnEnd: true,
  gridColumnSpan: true,
  gridColumnStart: true,
  fontWeight: true,
  lineClamp: true,
  lineHeight: true,
  opacity: true,
  order: true,
  orphans: true,
  tabSize: true,
  widows: true,
  zIndex: true,
  zoom: true,

  // SVG-related properties
  fillOpacity: true,
  floodOpacity: true,
  stopOpacity: true,
  strokeDasharray: true,
  strokeDashoffset: true,
  strokeMiterlimit: true,
  strokeOpacity: true,
  strokeWidth: true
};

const addImportDeclaration = (t, path) => {
  const upperPath = path.find(path => {
    return path.listKey === "body";
  });
  upperPath.parentPath.traverse({
    ImportDeclaration(path) {
      if (
        path.node.source.value === "react-emotion" &&
        !path.node.specifiers.find(s => s.imported && s.imported.name === "css")
      ) {
        const start = path.node.loc.start;

        path.replaceWith(
          t.importDeclaration(
            path.node.specifiers.concat([
              t.importSpecifier(t.identifier("css"), t.identifier("css"))
            ]),
            path.node.source
          )
        );
        path.node.loc = { start };
        path.requeue();
      }
    }
  });
};

const toCssLiteral = ({ path, t, args, pre }) => {
  const quasis = [];
  const expressions = [];

  let text = "";
  const indentation = "  ";

  const finalize = (expr, str) => {
    quasis.push(t.templateElement({ raw: text }));
    expressions.push(expr);
    text = str;
  };
  const serialize = (styles, level = 1) => {
    const indent = indentation.repeat(level);

    styles.forEach((prop, i) => {
      if (t.isObjectExpression(prop.value)) {
        if (i !== 0) {
          text += "\n";
        }

        if (prop.computed) {
          text += `\n${indent}`;
          finalize(prop.key, " {");
        } else {
          let key;

          if (t.isIdentifier(prop.key)) {
            key = prop.key.name;
          } else {
            key = prop.key.value;
          }

          text += `\n${indent}${key} {`;
        }

        serialize(prop.value.properties, level + 1);
        text += `\n${indent}}`;
        return;
      }

      let key;

      if (prop.computed) {
        text += `\n${indent}`;
        finalize(prop.key, ": ");
      } else {
        if (t.isIdentifier(prop.key)) {
          key = prop.key.name;
        } else {
          key = prop.key.value;
        }

        text += `\n${indent}${dashify(key)}: `;
      }

      if (t.isStringLiteral(prop.value) || t.isNumericLiteral(prop.value)) {
        let value = prop.value.value;

        if (t.isNumericLiteral(prop.value) && key && !unitless[key]) {
          value += "px";
        }

        text += `${value};`;
      } else {
        finalize(prop.value, ";");
      }
    });
  };

  args.forEach((arg, i) => {
    if (t.isObjectExpression(arg)) {
      serialize(arg.properties);
      quasis.push(t.templateElement({ raw: `${text}\n` }));
      text = ";";
    } else if (
      t.isArrowFunctionExpression(arg) &&
      arg.expression &&
      t.isObjectExpression(arg.body)
    ) {
      addImportDeclaration(t, path);
      quasis.push(t.templateElement({ raw: `${text}\n` }));
      expressions.push(
        t.arrowFunctionExpression(
          arg.params,
          toCssLiteral({ args: [arg.body], t, pre: t.identifier("css") })
        )
      );

      text = ";";
    } else {
      quasis.push(t.templateElement({ raw: `${text}\n` }));
      expressions.push(arg);
      text = ";";
    }
  });
  if (!pre) return t.templateLiteral(quasis, expressions);
  return t.taggedTemplateExpression(
    pre,
    t.templateLiteral(quasis, expressions)
  );
};

module.exports = function(babel /*: any */) {
  const { types: t } = babel;

  return {
    visitor: {
      JSXAttribute(path) {
        if (
          path.node.name &&
          path.node.name.name === "css" &&
          t.isObjectExpression(path.node.value.expression)
        ) {
          const obj = path.node.value.expression;
          const cssLiteral = toCssLiteral({
            t,
            path,
            args: [obj]
          });

          const start = path.node.loc.start;
          addImportDeclaration(t, path);
          path.replaceWith(
            t.jSXAttribute(path.node.name, t.jSXExpressionContainer(cssLiteral))
          );
          path.node.loc = { start };
          path.requeue();
        }
      },
      CallExpression(path /*: any */) {
        const { callee, arguments: args } = path.node;
        let cssLiteral;

        if (
          t.isCallExpression(callee) &&
          callee.callee.name === "styled" &&
          callee.arguments.length === 1
        ) {
          cssLiteral = toCssLiteral({
            path,
            args,
            t,
            pre: t.callExpression(t.identifier("styled"), callee.arguments)
          });
        }
        if (t.isMemberExpression(callee) && callee.object.name === "styled") {
          cssLiteral = toCssLiteral({
            path,
            args,
            t,
            pre: t.memberExpression(t.identifier("styled"), callee.property)
          });
        }
        if (callee.name === "css") {
          cssLiteral = toCssLiteral({
            path,
            args,
            t,
            pre: t.identifier("css")
          });
        }
        if (cssLiteral) {
          const start = path.node.loc.start;

          path.replaceWith(cssLiteral);
          path.node.loc = { start };
          path.requeue();
        }
      }
    }
  };
};
