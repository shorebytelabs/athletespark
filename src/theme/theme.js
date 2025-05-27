export const colors = {
  background: '#1A1A1A',
  surface: '#2A2A2A',
  textPrimary: '#F0F0F0', //off-white
  textSecondary: '#BBBBBB',
  placeholder: '#777777',
  border: '#3A3A3A',

  accent1: '#004D61', //dark teal
  accent2: '#822659', //deep ruby
  button: '#3E5641', //forest green

  success: '#4CAF50',
  danger: '#B00020',
  warning: '#FFB300',
  highlight: '#00A6A6',

  inputBackground: '#2D2D2D',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const navigationDarkTheme = {
  dark: true,
  colors: {
    primary: colors.accent1,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.accent1,
    notification: colors.accent2,
  },
};
