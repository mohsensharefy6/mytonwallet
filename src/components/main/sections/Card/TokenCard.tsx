import React, { memo, useMemo, useState } from '../../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../../global';

import type { ApiBaseCurrency } from '../../../../api/types';
import type { PriceHistoryPeriods, TokenPeriod, UserToken } from '../../../../global/types';

import { DEFAULT_PRICE_CURRENCY, HISTORY_PERIODS, TONCOIN_SLUG } from '../../../../config';
import { selectCurrentAccountState } from '../../../../global/selectors';
import buildClassName from '../../../../util/buildClassName';
import { vibrate } from '../../../../util/capacitor';
import { formatShortDay } from '../../../../util/dateFormat';
import { toBig, toDecimal } from '../../../../util/decimals';
import { formatCurrency, getShortCurrencySymbol } from '../../../../util/formatNumber';
import { round } from '../../../../util/round';
import { IS_IOS } from '../../../../util/windowEnvironment';
import { ASSET_LOGO_PATHS } from '../../../ui/helpers/assetLogos';
import { calculateTokenCardColor } from '../../helpers/cardColors';

import useFlag from '../../../../hooks/useFlag';
import useForceUpdate from '../../../../hooks/useForceUpdate';
import useInterval from '../../../../hooks/useInterval';
import useLang from '../../../../hooks/useLang';
import useLastCallback from '../../../../hooks/useLastCallback';
import useSyncEffect from '../../../../hooks/useSyncEffect';
import useTimeout from '../../../../hooks/useTimeout';

import TokenPriceChart from '../../../common/TokenPriceChart';
import Button from '../../../ui/Button';
import Loading from '../../../ui/Loading';
import Transition from '../../../ui/Transition';
import ChartHistorySwitcher from './ChartHistorySwitcher';
import CurrencySwitcher from './CurrencySwitcher';

import styles from './Card.module.scss';

import tonUrl from '../../../../assets/coins/ton.svg';

interface OwnProps {
  token: UserToken;
  classNames: string;
  onApyClick?: NoneToVoidFunction;
  onClose: NoneToVoidFunction;
}

interface StateProps {
  period?: TokenPeriod;
  apyValue: number;
  baseCurrency?: ApiBaseCurrency;
  historyPeriods?: PriceHistoryPeriods;
}

const OFFLINE_TIMEOUT = 120000; // 2 minutes

const CHART_DIMENSIONS = { width: 300, height: 64 };
const INTERVAL = 5 * 1000;

const DEFAULT_PERIOD = HISTORY_PERIODS[0];

function TokenCard({
  token,
  classNames,
  period = DEFAULT_PERIOD,
  apyValue,
  onApyClick,
  onClose,
  baseCurrency,
  historyPeriods,
}: OwnProps & StateProps) {
  const { loadPriceHistory } = getActions();
  const lang = useLang();
  const forceUpdate = useForceUpdate();
  const [isCurrencyMenuOpen, openCurrencyMenu, closeCurrencyMenu] = useFlag(false);
  const [isHistoryMenuOpen, openHistoryMenu, closeHistoryMenu] = useFlag(false);

  const shouldUseDefaultCurrency = baseCurrency === undefined || baseCurrency === token.symbol;
  const chartCurrency = shouldUseDefaultCurrency ? DEFAULT_PRICE_CURRENCY : baseCurrency;

  const currencySymbol = getShortCurrencySymbol(chartCurrency);

  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);

  useSyncEffect(([prevHistoryIndex]) => {
    if (!IS_IOS) return;

    if (prevHistoryIndex !== undefined) {
      vibrate();
    }
  }, [selectedHistoryIndex]);

  const {
    slug, symbol, amount, image, name, price: lastPrice, decimals,
  } = token;

  const logoPath = slug === TONCOIN_SLUG
    ? tonUrl
    : image || ASSET_LOGO_PATHS[symbol.toLowerCase() as keyof typeof ASSET_LOGO_PATHS];

  const refreshHistory = useLastCallback((newPeriod?: TokenPeriod) => {
    loadPriceHistory({ slug, period: newPeriod ?? period });
  });

  const handleCurrencyChange = useLastCallback((currency: ApiBaseCurrency) => {
    loadPriceHistory({ slug, period, currency });
  });

  useInterval(refreshHistory, INTERVAL);

  const history = historyPeriods?.[period];

  const tokenLastUpdatedAt = history?.length ? history[history.length - 1][0] * 1000 : undefined;
  const tokenLastHistoryPrice = history?.length ? history[history.length - 1][1] : lastPrice;
  const selectedHistoryPoint = history?.[selectedHistoryIndex];
  const price = selectedHistoryPoint?.[1]
    ?? (shouldUseDefaultCurrency ? tokenLastHistoryPrice : undefined)
    ?? lastPrice;
  const isLoading = !tokenLastUpdatedAt || (Date.now() - tokenLastUpdatedAt > OFFLINE_TIMEOUT);
  const dateStr = selectedHistoryPoint
    ? formatShortDay(lang.code!, selectedHistoryPoint[0] * 1000, true, true)
    : (isLoading && tokenLastUpdatedAt ? formatShortDay(lang.code!, tokenLastUpdatedAt, true, false) : lang('Now'));

  useTimeout(forceUpdate, isLoading ? undefined : OFFLINE_TIMEOUT, [tokenLastUpdatedAt]);

  const initialPrice = useMemo(() => {
    return history?.find(([, value]) => Boolean(value))?.[1];
  }, [history]);

  const change = (initialPrice && lastPrice) ? lastPrice - initialPrice : 0;

  const value = toBig(amount, decimals).mul(price).toString();
  const changePrefix = change === undefined ? change : change > 0 ? '↑' : change < 0 ? '↓' : 0;

  const changeValue = change ? Math.abs(round(change, 4)) : 0;
  const changePercent = change ? Math.abs(round((change / initialPrice!) * 100, 2)) : 0;

  const withChange = Boolean(change !== undefined);
  const historyStartDay = history?.length ? new Date(history![0][0] * 1000) : undefined;
  const withCmcButton = Boolean(token.cmcSlug);
  const shouldHideChartPeriodSwitcher = !history?.length && token.priceUsd === 0;

  const color = useMemo(() => calculateTokenCardColor(token), [token]);

  return (
    <div className={buildClassName(styles.container, styles.tokenCard, classNames, color, 'token-card')}>
      <div className={styles.tokenInfo}>
        <Button className={styles.backButton} isSimple onClick={onClose} ariaLabel={lang('Back')}>
          <i className="icon-chevron-left" aria-hidden />
        </Button>
        <img className={styles.tokenLogo} src={logoPath} alt={token.name} />
        <div>
          <b className={styles.tokenAmount}>{formatCurrency(toDecimal(amount, token.decimals), symbol)}</b>
          <span className={styles.tokenName}>
            {name}
            {token.slug === TONCOIN_SLUG && (
              <span className={styles.apy} onClick={onApyClick}>
                APY {apyValue}%
              </span>
            )}
          </span>
        </div>
      </div>

      {withChange && (
        <div className={styles.tokenPrice}>
          <span className={styles.currencySwitcher} role="button" tabIndex={0} onClick={openCurrencyMenu}>
            ≈&thinsp;{formatCurrency(value, currencySymbol, undefined, true)}
            <i className={buildClassName('icon', 'icon-caret-down', styles.iconCaretSmall)} aria-hidden />
          </span>
          <CurrencySwitcher
            isOpen={isCurrencyMenuOpen}
            menuPositionHorizontal="right"
            excludedCurrency={token.symbol}
            onClose={closeCurrencyMenu}
            onChange={handleCurrencyChange}
          />

          {Boolean(changeValue) && (
            <div className={styles.tokenChange}>
              {changePrefix}
              &thinsp;
              {Math.abs(changePercent)}% · {formatCurrency(Math.abs(changeValue), currencySymbol)}
            </div>
          )}
        </div>
      )}

      <Transition activeKey={!history ? 0 : history.length ? HISTORY_PERIODS.indexOf(period) + 1 : -1} name="fade">
        {!history ? (
          <div className={buildClassName(styles.isLoading)}>
            <Loading color="white" className={styles.center} />
          </div>
        ) : history?.length ? (
          <>
            <TokenPriceChart
              className={styles.chart}
              imgClassName={styles.chartImg}
              width={CHART_DIMENSIONS.width}
              height={CHART_DIMENSIONS.height}
              prices={history!}
              selectedIndex={selectedHistoryIndex}
              onSelectIndex={setSelectedHistoryIndex}
            />

            <div className={styles.tokenHistoryPrice}>
              {formatCurrency(history![0][1], currencySymbol, undefined, true)}
              <div className={styles.tokenPriceDate}>{formatShortDay(lang.code!, historyStartDay!)}</div>
            </div>
          </>
        ) : undefined}
      </Transition>

      <span
        className={buildClassName(styles.periodChooser, shouldHideChartPeriodSwitcher && styles.periodChooserHidden)}
        role="button"
        tabIndex={0}
        onClick={openHistoryMenu}
      >
        {period === 'ALL' ? 'All' : period}
        <i className={buildClassName('icon', 'icon-caret-down', styles.iconCaretSmall)} aria-hidden />
        <ChartHistorySwitcher
          isOpen={isHistoryMenuOpen}
          onChange={refreshHistory}
          onClose={closeHistoryMenu}
        />
      </span>

      <div className={styles.tokenCurrentPrice}>
        {formatCurrency(price, currencySymbol, selectedHistoryIndex === -1 ? 2 : 4, true)}
        <div className={styles.tokenPriceDate}>
          {dateStr}
          {withCmcButton && (
            <>
              {' · '}
              <a
                href={`https://coinmarketcap.com/currencies/${token.cmcSlug}/`}
                title={lang('Open on CoinMarketCap')}
                target="_blank"
                rel="noreferrer"
                className={styles.cmcButton}
              >
                <i className="icon-coinmarket" aria-hidden />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(
  withGlobal<OwnProps>((global, ownProps): StateProps => {
    const accountState = selectCurrentAccountState(global);

    return {
      period: accountState?.currentTokenPeriod,
      apyValue: accountState?.staking?.apy || 0,
      baseCurrency: global.settings.baseCurrency,
      historyPeriods: global.tokenPriceHistory.bySlug[ownProps.token.slug],
    };
  })(TokenCard),
);
